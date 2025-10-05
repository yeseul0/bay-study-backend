import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import { DatabaseService } from '../database/database.service';
import { getUnixTimestamp } from '../utils/time.util';
import axios from 'axios';
import * as crypto from 'crypto';

export interface CommitData {
  commitId: string;
  message: string;
  timestamp: string;
  authorEmail: string;
  authorName: string;
  repositoryName: string;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 웹훅에서 받은 커밋 데이터 처리
   */
  async processCommit(commitData: CommitData): Promise<void> {
    try {
      this.logger.log(`Processing commit: ${commitData.commitId}`);
      this.logger.log(`Author: ${commitData.authorName} (${commitData.authorEmail})`);
      this.logger.log(`Repository: ${commitData.repositoryName}`);
      this.logger.log(`Timestamp: ${commitData.timestamp}`);

      // 레포지토리 URL로 관련된 스터디들 찾기
      const studies = await this.databaseService.findStudiesByRepository(commitData.repositoryName);
      if (studies.length === 0) {
        this.logger.warn(`No studies found for repository: ${commitData.repositoryName}`);
        return;
      }

      this.logger.log(`Found ${studies.length} studies for repository: ${commitData.repositoryName}`);

      // 각 스터디별로 사용자 참여 여부 확인 및 커밋 기록
      for (const study of studies) {
        const participation = await this.databaseService.isUserParticipantInStudy(
          commitData.authorEmail,
          study.proxy_address
        );

        if (!participation.isParticipant) {
          this.logger.log(`User ${commitData.authorEmail} is not a participant in study ${study.study_name}`);
          continue;
        }

        this.logger.log(`User ${commitData.authorEmail} is participant in study ${study.study_name} (wallet: ${participation.walletAddress})`);

        // 지갑 주소 유효성 검사
        if (!this.blockchainService.isValidAddress(participation.walletAddress!)) {
          this.logger.warn(`Invalid Ethereum address: ${participation.walletAddress}`);
          continue;
        }

        // 커밋 시간을 Unix 타임스탬프로 변환
        const commitTimestamp = getUnixTimestamp(new Date(commitData.timestamp));

        // 스터디 시간 체크 (start_time과 end_time은 Unix timestamp)
        const isWithinStudyTime = this.isCommitWithinStudyTime(
          commitTimestamp,
          study.study_start_time,
          study.study_end_time
        );

        if (!isWithinStudyTime) {
          this.logger.log(`Commit time ${new Date(commitData.timestamp).toISOString()} is outside study hours for ${study.study_name}`);
          this.logger.log(`Commit timestamp: ${commitTimestamp}, Study start offset: ${study.study_start_time}s, Study end offset: ${study.study_end_time}s`);
          this.logger.log(`Commit time in KST: ${new Date(commitData.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
          const startHour = Math.floor(study.study_start_time / 3600);
          const startMin = Math.floor((study.study_start_time % 3600) / 60);
          const endHour = Math.floor(study.study_end_time / 3600);
          const endMin = Math.floor((study.study_end_time % 3600) / 60);
          this.logger.log(`Study time: ${startHour}:${String(startMin).padStart(2, '0')} ~ ${endHour}:${String(endMin).padStart(2, '0')} (${endHour >= 24 ? '다음날 ' + (endHour-24) + ':' + String(endMin).padStart(2, '0') : endHour + ':' + String(endMin).padStart(2, '0')})`);
          continue;
        }

        this.logger.log(`Commit is within study hours for ${study.study_name}, recording to blockchain...`);

        // 디버그: 실제 계산된 시간 출력
        const commitDate = new Date(commitTimestamp * 1000);
        const kstOffset = 9 * 60 * 60 * 1000;
        const commitKST = new Date(commitDate.getTime() + kstOffset);
        const commitDateMidnight = new Date(commitKST.getFullYear(), commitKST.getMonth(), commitKST.getDate());
        const midnightTimestamp = Math.floor(commitDateMidnight.getTime() / 1000) - kstOffset / 1000;
        const actualStartTime = midnightTimestamp + study.study_start_time;
        const actualEndTime = midnightTimestamp + study.study_end_time;

        this.logger.log(`DEBUG - Commit: ${new Date(commitTimestamp * 1000).toISOString()}`);
        this.logger.log(`DEBUG - Study start: ${new Date(actualStartTime * 1000).toISOString()}`);
        this.logger.log(`DEBUG - Study end: ${new Date(actualEndTime * 1000).toISOString()}`);
        this.logger.log(`DEBUG - Midnight base: ${new Date(midnightTimestamp * 1000).toISOString()}`);

        // 커밋 날짜 (YYYY-MM-DD 형식)
        const commitDate = new Date(commitData.timestamp).toISOString().split('T')[0];

        // 데이터베이스에 커밋 기록 저장 (하루 첫 번째 커밋만)
        const commitRecord = await this.databaseService.recordCommit({
          studyId: study.id,
          userId: participation.userId!, // userId 추가 필요
          date: commitDate,
          commitTimestamp: commitTimestamp,
          commitId: commitData.commitId,
          commitMessage: commitData.message,
          walletAddress: participation.walletAddress!
        });

        if (commitRecord.isFirstCommit) {
          // 스터디 날짜 계산: 스터디 시작 시간을 기준으로 날짜 결정
          const studyDate = this.calculateStudyDate(commitTimestamp, study.study_start_time, study.study_end_time);

          // 해당 스터디에서 오늘 첫 번째 커밋인 경우 startTodayStudy 먼저 호출
          if (commitRecord.isFirstStudyCommitToday) {
            await this.blockchainService.startTodayStudy(study.proxy_address, studyDate);
            this.logger.log(`Started today's study for ${study.study_name} (first commit of the day, study date: ${new Date(studyDate * 1000).toISOString()})`);
          }

          // 개별 커밋 트래킹 (같은 studyDate 사용)
          await this.blockchainService.trackCommit(study.proxy_address, participation.walletAddress!, commitTimestamp, studyDate);
          this.logger.log(`Successfully tracked FIRST commit for ${participation.walletAddress} in study ${study.study_name} (${commitData.authorEmail})`);
        } else {
          this.logger.log(`Commit already recorded for today in study ${study.study_name} - skipping blockchain call`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process commit', error);
      throw error;
    }
  }

  /**
   * 커밋 시간이 스터디 시간 내에 있는지 확인
   * @param commitTimestamp 커밋 시간 (Unix timestamp)
   * @param studyStartTime 하루 중 시작 시간 (자정부터 초 단위, 예: 23시 = 82800)
   * @param studyEndTime 하루 중 종료 시간 (자정부터 초 단위, 예: 새벽1시 = 3600)
   */
  private isCommitWithinStudyTime(
    commitTimestamp: number,
    studyStartTime: number,
    studyEndTime: number
  ): boolean {
    // 커밋 시간을 KST로 변환
    const commitDate = new Date(commitTimestamp * 1000);
    const kstOffset = 9 * 60 * 60 * 1000; // 9시간을 밀리초로
    const commitKST = new Date(commitDate.getTime() + kstOffset);

    // 커밋 날짜의 자정 (KST 기준)
    const commitDateMidnight = new Date(commitKST.getFullYear(), commitKST.getMonth(), commitKST.getDate());
    const midnightTimestamp = Math.floor(commitDateMidnight.getTime() / 1000) - kstOffset / 1000; // UTC로 다시 변환

    // 스터디 시작/종료 시간 계산
    const actualStartTime = midnightTimestamp + studyStartTime;
    const actualEndTime = midnightTimestamp + studyEndTime;

    // 새벽을 넘나드는 스터디인지 확인
    // 조건: studyEndTime > 24시간(86400초) 또는 studyEndTime < studyStartTime
    if (studyEndTime > 24 * 60 * 60 || studyEndTime < studyStartTime) {
      // 새벽을 넘나드는 경우
      // studyEndTime이 24시간을 넘으면 (예: 26:00 = 93600초) 실제로는 다음날 새벽 시간
      const realEndTime = studyEndTime > 24 * 60 * 60 ? studyEndTime - 24 * 60 * 60 : studyEndTime;
      const nextDayEndTime = midnightTimestamp + 24 * 60 * 60 + realEndTime;

      // 시작시간 이후이거나 다음날 종료시간 이전이면 스터디 시간 내
      return (commitTimestamp >= actualStartTime) || (commitTimestamp <= nextDayEndTime);
    } else {
      // 같은 날 내에서 끝나는 경우
      return commitTimestamp >= actualStartTime && commitTimestamp <= actualEndTime;
    }
  }

  /**
   * 스터디 날짜 계산 (스터디 시작 시간 기준)
   * 예: 11시-새벽1시 스터디에서 12시30분 커밋 → 11시 기준 날짜의 자정 타임스탬프
   * @param commitTimestamp 커밋 시간 (Unix timestamp)
   * @param studyStartTime 스터디 시작 시간 (Unix timestamp)
   * @param studyEndTime 스터디 종료 시간 (Unix timestamp)
   */
  private calculateStudyDate(
    commitTimestamp: number,
    studyStartTime: number,
    studyEndTime: number
  ): number {
    const commitDate = new Date(commitTimestamp * 1000);
    const startDate = new Date(studyStartTime * 1000);
    const endDate = new Date(studyEndTime * 1000);

    // 스터디가 자정을 넘나드는지 확인 (예: 23:00-01:00)
    const isOvernight = endDate.getTime() < startDate.getTime() ||
                       (endDate.getDate() !== startDate.getDate());

    let studyBaseDate: Date;

    if (isOvernight) {
      // 자정을 넘나드는 스터디의 경우
      // 커밋 시간이 스터디 종료 시간 이전이면서 자정 이후라면, 스터디 시작일 기준
      if (commitDate.getHours() < 12) { // 오전 시간대 (자정 이후)
        // 스터디 시작일을 기준으로 함 (하루 전)
        studyBaseDate = new Date(startDate);
      } else {
        // 오후/저녁 시간대면 해당 날짜 기준
        studyBaseDate = new Date(commitDate);
      }
    } else {
      // 자정을 넘나들지 않는 스터디의 경우 커밋 날짜 기준
      studyBaseDate = new Date(commitDate);
    }

    // 해당 날짜의 자정 타임스탬프 반환
    const midnight = new Date(studyBaseDate);
    midnight.setHours(0, 0, 0, 0);

    return Math.floor(midnight.getTime() / 1000);
  }

  /**
   * GitHub 웹훅 서명 검증
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const secret = this.configService.get('GITHUB_WEBHOOK_SECRET');
      if (!secret) {
        this.logger.error('GITHUB_WEBHOOK_SECRET not configured');
        return false;
      }

      // GitHub가 보내는 서명 형식: "sha256=해시값"
      const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;

      // 타이밍 공격을 방지하는 안전한 비교
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', error);
      return false;
    }
  }

  /**
   * GitHub 레포지토리에 웹훅 추가
   */
  async createRepositoryWebhook(repoUrl: string, accessToken: string): Promise<void> {
    try {
      // GitHub URL에서 owner/repo 추출
      const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub repository URL');
      }

      const [, owner, repo] = urlMatch;
      const cleanRepo = repo.replace(/\.git$/, ''); // .git 확장자 제거

      this.logger.log(`Creating webhook for ${owner}/${cleanRepo}`);

      // 기존 웹훅 확인
      const existingWebhooks = await this.getRepositoryWebhooks(owner, cleanRepo, accessToken);
      const targetUrl = this.configService.get('GITHUB_WEBHOOK_URL');

      const existingWebhook = existingWebhooks.find(hook =>
        hook.config?.url === targetUrl &&
        hook.events.includes('push') &&
        hook.active
      );

      if (existingWebhook) {
        this.logger.log(`Webhook already exists for ${owner}/${cleanRepo} (ID: ${existingWebhook.id})`);
        return; // 이미 존재하므로 생성하지 않음
      }

      // 웹훅 설정
      const webhookSecret = this.configService.get('GITHUB_WEBHOOK_SECRET');
      if (!webhookSecret) {
        throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required');
      }

      const webhookConfig = {
        name: 'web',
        active: true,
        events: ['push'], // push 이벤트만 구독
        config: {
          url: this.configService.get('GITHUB_WEBHOOK_URL'),
          content_type: 'json',
          insecure_ssl: '0', // HTTPS 필수
          secret: webhookSecret // 보안을 위한 시크릿 키
        }
      };

      // GitHub API로 웹훅 생성
      const response = await axios.post(
        `https://api.github.com/repos/${owner}/${cleanRepo}/hooks`,
        webhookConfig,
        {
          headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Bay-Study-Backend'
          }
        }
      );

      this.logger.log(`Webhook created successfully for ${owner}/${cleanRepo}. Hook ID: ${response.data.id}`);
    } catch (error) {
      this.logger.error(`Failed to create webhook for ${repoUrl}`, error);

      if (error.response?.status === 422) {
        // 웹훅이 이미 존재하는 경우
        this.logger.warn(`Webhook already exists for ${repoUrl}`);
        return; // 이미 존재하면 에러로 처리하지 않음
      }

      if (error.response?.status === 403) {
        throw new Error('Insufficient permissions to create webhook. Admin access required.');
      }

      if (error.response?.status === 404) {
        throw new Error('Repository not found or access denied.');
      }

      throw new Error(`Failed to create webhook: ${error.message}`);
    }
  }

  /**
   * 레포지토리의 기존 웹훅 목록 조회
   */
  private async getRepositoryWebhooks(owner: string, repo: string, accessToken: string): Promise<any[]> {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Bay-Study-Backend'
        }
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`Repository ${owner}/${repo} not found or no access`);
        return [];
      }
      this.logger.error(`Failed to get webhooks for ${owner}/${repo}`, error);
      return [];
    }
  }

  /**
   * 사용자의 GitHub 레포지토리 목록 가져오기
   */
  async getUserRepositories(githubEmail: string): Promise<Array<{
    id: number;
    name: string;
    fullName: string;
    description: string;
    htmlUrl: string;
    private: boolean;
    updatedAt: string;
  }>> {
    // 사용자의 GitHub access token 가져오기
    const accessToken = await this.databaseService.getUserGithubToken(githubEmail);

    if (!accessToken) {
      throw new Error('GitHub access token not found. Please login again.');
    }

    // GitHub API 호출
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      params: {
        sort: 'updated',
        per_page: 100
      }
    });

    return response.data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      htmlUrl: repo.html_url,
      private: repo.private,
      updatedAt: repo.updated_at
    }));
  }
}