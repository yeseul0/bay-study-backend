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

        // 블록체인에 커밋 기록 (해당 스터디 프록시에, 참가자의 지갑 주소로)
        await this.blockchainService.trackCommit(participation.walletAddress!, commitTimestamp);

        this.logger.log(`Successfully tracked commit for ${participation.walletAddress} in study ${study.study_name} (${commitData.authorEmail})`);
      }
    } catch (error) {
      this.logger.error('Failed to process commit', error);
      throw error;
    }
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
          url: `${this.configService.get('WEBHOOK_PAYLOAD_URL')}/github/webhook`,
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