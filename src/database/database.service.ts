import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';
import { CommitRecord } from '../entities/commit-record.entity';
import { Balance } from '../entities/balance.entity';
import { StudySession, StudySessionStatus } from '../entities/study-session.entity';

export interface RegisterParticipantDto {
  walletAddress: string;
  proxyAddress: string;
  githubEmail: string;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: TypeOrmRepository<User>,
    @InjectRepository(Study)
    private studyRepository: TypeOrmRepository<Study>,
    @InjectRepository(UserStudy)
    private userStudyRepository: TypeOrmRepository<UserStudy>,
    @InjectRepository(Repository)
    private repositoryRepository: TypeOrmRepository<Repository>,
    @InjectRepository(CommitRecord)
    private commitRecordRepository: TypeOrmRepository<CommitRecord>,
    @InjectRepository(Balance)
    private balanceRepository: TypeOrmRepository<Balance>,
    @InjectRepository(StudySession)
    private studySessionRepository: TypeOrmRepository<StudySession>,
  ) {}

  /**
   * 스터디 생성
   */
  async createStudy(data: {
    proxyAddress: string;
    studyName: string;
    studyStartTime: number;
    studyEndTime: number;
    depositAmount: string;
    penaltyAmount: string;
  }): Promise<Study> {
    const { proxyAddress, studyName, studyStartTime, studyEndTime, depositAmount, penaltyAmount } = data;

    // 이미 존재하는지 확인
    const existingStudy = await this.studyRepository.findOne({
      where: { proxy_address: proxyAddress.toLowerCase() }
    });

    if (existingStudy) {
      this.logger.warn(`Study with proxy address ${proxyAddress} already exists`);
      return existingStudy;
    }

    // 새 스터디 생성
    const study = this.studyRepository.create({
      proxy_address: proxyAddress.toLowerCase(),
      study_name: studyName,
      study_start_time: studyStartTime,
      study_end_time: studyEndTime,
      deposit_amount: depositAmount,
      penalty_amount: penaltyAmount,
    });

    const savedStudy = await this.studyRepository.save(study);
    this.logger.log(`Created new study: ${studyName} (${proxyAddress})`);

    return savedStudy;
  }

  /**
   * 모든 스터디 목록 조회 (참여자 정보 포함)
   */
  async getAllStudies(): Promise<Study[]> {
    return await this.studyRepository.find({
      relations: ['user_studies', 'user_studies.user'],
      order: { created_at: 'DESC' }
    });
  }

  /**
   * 모든 데이터 삭제 (개발용)
   */
  async clearAllData(): Promise<void> {
    // QueryBuilder로 모든 레코드 삭제
    await this.balanceRepository.createQueryBuilder().delete().execute();
    await this.commitRecordRepository.createQueryBuilder().delete().execute();
    await this.repositoryRepository.createQueryBuilder().delete().execute();
    await this.userStudyRepository.createQueryBuilder().delete().execute();
    await this.studySessionRepository.createQueryBuilder().delete().execute();
    await this.studyRepository.createQueryBuilder().delete().execute();
    await this.userRepository.createQueryBuilder().delete().execute();

    this.logger.log('All data cleared with QueryBuilder DELETE');
  }

  /**
   * 모든 커밋 기록 조회
   */
  async getAllCommits(): Promise<any[]> {
    try {
      const commits = await this.commitRecordRepository.find({
        relations: ['user', 'study_session', 'study_session.study'],
        order: {
          commit_timestamp: 'DESC'
        }
      });

      return commits.map(commit => ({
        id: commit.id,
        commitId: commit.commit_id,
        commitMessage: commit.commit_message,
        commitTimestamp: commit.commit_timestamp,
        date: commit.study_session?.study_date,
        walletAddress: commit.wallet_address,
        user: {
          id: commit.user?.id,
          githubEmail: commit.user?.github_email
        },
        study: {
          id: commit.study_session?.study?.id,
          studyName: commit.study_session?.study?.study_name,
          proxyAddress: commit.study_session?.study?.proxy_address
        },
        studySession: {
          id: commit.study_session?.id,
          studyDate: commit.study_session?.study_date,
          status: commit.study_session?.status
        }
      }));
    } catch (error) {
      this.logger.error('Failed to get all commits', error);
      throw error;
    }
  }

  /**
   * 참가자 등록
   */
  async registerParticipant(dto: RegisterParticipantDto): Promise<void> {
    const { walletAddress, proxyAddress, githubEmail } = dto;

    // 1. User 찾기 또는 생성
    let user = await this.userRepository.findOne({
      where: { github_email: githubEmail.toLowerCase() }
    });

    if (!user) {
      user = this.userRepository.create({
        github_email: githubEmail.toLowerCase(),
      });
      user = await this.userRepository.save(user);
      this.logger.log(`Created new user: ${githubEmail}`);
    }

    // 2. Study 찾기 또는 생성
    let study = await this.studyRepository.findOne({
      where: { proxy_address: proxyAddress.toLowerCase() }
    });

    if (!study) {
      // 스터디가 없으면 에러 - 스터디는 미리 생성되어 있어야 함
      throw new Error(`Study not found for proxy address: ${proxyAddress}`);
    }

    // 3. 이미 등록되었는지 확인
    const existingUserStudy = await this.userStudyRepository.findOne({
      where: {
        user_id: user.id,
        study_id: study.id,
      }
    });

    if (existingUserStudy) {
      this.logger.warn(`User ${githubEmail} already registered for study ${proxyAddress}`);
      return;
    }

    // 4. UserStudy 등록
    const userStudy = this.userStudyRepository.create({
      user_id: user.id,
      study_id: study.id,
      wallet_address: walletAddress.toLowerCase(),
    });

    await this.userStudyRepository.save(userStudy);
    this.logger.log(`Registered ${githubEmail} (${walletAddress}) for study ${proxyAddress}`);
  }

  /**
   * 스터디에서 참가자 탈퇴 (완전 삭제)
   */
  async withdrawFromStudy(githubEmail: string, proxyAddress: string): Promise<void> {
    // 1. 사용자 찾기
    const user = await this.userRepository.findOne({
      where: { github_email: githubEmail.toLowerCase() }
    });

    if (!user) {
      throw new Error(`User not found: ${githubEmail}`);
    }

    // 2. 스터디 찾기
    const study = await this.studyRepository.findOne({
      where: { proxy_address: proxyAddress.toLowerCase() }
    });

    if (!study) {
      throw new Error(`Study not found: ${proxyAddress}`);
    }

    // 3. 참가자 관계 삭제
    const userStudy = await this.userStudyRepository.findOne({
      where: {
        user_id: user.id,
        study_id: study.id
      }
    });

    if (!userStudy) {
      throw new Error(`User ${githubEmail} is not a participant in study ${proxyAddress}`);
    }

    await this.userStudyRepository.remove(userStudy);
    this.logger.log(`Removed participant ${githubEmail} from study ${proxyAddress}`);

    // 4. 해당 사용자가 이 스터디에 등록한 레포지토리들 완전 삭제
    const deleteResult = await this.repositoryRepository.delete({
      user_id: user.id,
      study_id: study.id
    });

    if (deleteResult.affected && deleteResult.affected > 0) {
      this.logger.log(`Deleted ${deleteResult.affected} repositories for ${githubEmail} in study ${proxyAddress}`);
    }

    // 5. 관련 커밋 기록도 삭제 (StudySession을 통해)
    const userStudySessions = await this.studySessionRepository.find({
      where: { study_id: study.id }
    });

    for (const session of userStudySessions) {
      await this.commitRecordRepository.delete({
        study_session_id: session.id,
        user_id: user.id
      });
    }

    // 6. 잔액 기록도 삭제 (선택사항)
    await this.balanceRepository.delete({
      study_id: study.id,
      user_id: user.id
    });

    this.logger.log(`Successfully removed ${githubEmail} from study ${proxyAddress} with all related data`);
  }

  /**
   * GitHub 이메일로 커밋 가능한 스터디 찾기
   */
  async findStudyForCommitByEmail(githubEmail: string): Promise<{
    walletAddress: string;
    proxyAddress: string;
    studyName: string;
  } | null> {
    const userStudy = await this.userStudyRepository
      .createQueryBuilder('us')
      .leftJoinAndSelect('us.user', 'user')
      .leftJoinAndSelect('us.study', 'study')
      .where('user.github_email = :email', { email: githubEmail.toLowerCase() })
      .orderBy('us.registered_at', 'DESC')
      .getOne();

    if (!userStudy) {
      return null;
    }

    return {
      walletAddress: userStudy.wallet_address,
      proxyAddress: userStudy.study.proxy_address,
      studyName: userStudy.study.study_name,
    };
  }

  /**
   * 레포지토리 URL로 스터디들 찾기 (하나의 레포가 여러 스터디에 등록될 수 있음)
   */
  async findStudiesByRepository(repoUrl: string): Promise<Study[]> {
    const repositories = await this.repositoryRepository
      .createQueryBuilder('repo')
      .leftJoinAndSelect('repo.study', 'study')
      .where('repo.repo_url = :repoUrl', { repoUrl })
      .andWhere('repo.is_active = :isActive', { isActive: true })
      .getMany();

    return repositories.map(repo => repo.study).filter(study => study !== null);
  }

  /**
   * 특정 사용자가 특정 스터디에 참여하고 있는지 확인
   */
  async isUserParticipantInStudy(githubEmail: string, proxyAddress: string): Promise<{
    isParticipant: boolean;
    walletAddress?: string;
    userId?: number;
  }> {
    const userStudy = await this.userStudyRepository
      .createQueryBuilder('us')
      .leftJoinAndSelect('us.user', 'user')
      .leftJoinAndSelect('us.study', 'study')
      .where('user.github_email = :email', { email: githubEmail.toLowerCase() })
      .andWhere('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .getOne();

    if (userStudy) {
      return {
        isParticipant: true,
        walletAddress: userStudy.wallet_address,
        userId: userStudy.user_id
      };
    }

    return { isParticipant: false };
  }

  /**
   * 사용자가 특정 스터디에 레포지토리를 등록했는지 확인
   */
  async hasUserRegisteredRepository(githubEmail: string, proxyAddress: string): Promise<boolean> {
    const count = await this.repositoryRepository
      .createQueryBuilder('repo')
      .leftJoin('repo.user', 'user')
      .leftJoin('repo.study', 'study')
      .where('user.github_email = :email', { email: githubEmail.toLowerCase() })
      .andWhere('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .andWhere('repo.is_active = :isActive', { isActive: true })
      .getCount();

    return count > 0;
  }

  /**
   * 특정 스터디의 참가자 목록 조회
   */
  async getStudyParticipants(proxyAddress: string): Promise<Array<{
    walletAddress: string;
    githubEmail: string;
    registeredAt: Date;
  }>> {
    const userStudies = await this.userStudyRepository
      .createQueryBuilder('us')
      .leftJoinAndSelect('us.user', 'user')
      .leftJoinAndSelect('us.study', 'study')
      .where('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .getMany();

    return userStudies.map(us => ({
      walletAddress: us.wallet_address,
      githubEmail: us.user.github_email,
      registeredAt: us.registered_at,
    }));
  }

  /**
   * 특정 참가자의 스터디 목록 조회
   */
  async getParticipantStudies(walletAddress: string): Promise<Array<{
    proxyAddress: string;
    studyName: string;
    registeredAt: Date;
  }>> {
    const userStudies = await this.userStudyRepository
      .createQueryBuilder('us')
      .leftJoinAndSelect('us.study', 'study')
      .where('us.wallet_address = :walletAddress', { walletAddress: walletAddress.toLowerCase() })
      .getMany();

    return userStudies.map(us => ({
      proxyAddress: us.study.proxy_address,
      studyName: us.study.study_name,
      registeredAt: us.registered_at,
    }));
  }

  /**
   * 사용자 GitHub access token 조회
   */
  async getUserGithubToken(githubEmail: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { github_email: githubEmail.toLowerCase() }
    });

    return user?.github_access_token || null;
  }

  /**
   * 스터디에 레포지토리 등록 (접근 토큰으로 웹훅 생성 포함)
   */
  async registerRepository(data: {
    proxyAddress: string;
    githubEmail: string;
    repoUrl: string;
    accessToken?: string;
  }): Promise<Repository> {
    const { proxyAddress, githubEmail, repoUrl, accessToken } = data;

    // 1. 사용자 찾기
    const user = await this.userRepository.findOne({
      where: { github_email: githubEmail.toLowerCase() }
    });

    if (!user) {
      throw new Error(`User not found: ${githubEmail}`);
    }

    // 2. 스터디 찾기
    const study = await this.studyRepository.findOne({
      where: { proxy_address: proxyAddress.toLowerCase() }
    });

    if (!study) {
      throw new Error(`Study not found: ${proxyAddress}`);
    }

    // 3. 이미 등록된 레포지토리인지 확인
    const existingRepo = await this.repositoryRepository.findOne({
      where: {
        study_id: study.id,
        repo_url: repoUrl,
        is_active: true
      }
    });

    if (existingRepo) {
      this.logger.warn(`Repository already registered: ${repoUrl} for study ${proxyAddress}`);
      return existingRepo;
    }

    // 4. 레포지토리 등록
    const repository = this.repositoryRepository.create({
      study_id: study.id,
      user_id: user.id,
      repo_url: repoUrl,
      is_active: true
    });

    const savedRepository = await this.repositoryRepository.save(repository);
    this.logger.log(`Registered repository: ${repoUrl} for study ${proxyAddress} by ${githubEmail}`);

    return savedRepository;
  }

  /**
   * 스터디의 등록된 레포지토리 목록 조회 (참여자별 그룹핑)
   */
  async getStudyRepositories(proxyAddress: string): Promise<Array<{
    participantEmail: string;
    participantWallet?: string;
    repositories: Array<{
      id: number;
      repoUrl: string;
      registeredAt: Date;
      isActive: boolean;
    }>;
  }>> {
    // 레포지토리 정보와 해당 사용자의 지갑 주소까지 함께 조회
    const repositories = await this.repositoryRepository
      .createQueryBuilder('repo')
      .leftJoinAndSelect('repo.user', 'user')
      .leftJoinAndSelect('repo.study', 'study')
      .leftJoin('user_studies', 'us', 'us.user_id = user.id AND us.study_id = study.id')
      .addSelect('us.wallet_address', 'wallet_address')
      .where('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .andWhere('repo.is_active = :isActive', { isActive: true })
      .orderBy('user.github_email', 'ASC')
      .addOrderBy('repo.created_at', 'DESC')
      .getRawAndEntities();

    // 참여자별로 그룹핑
    const groupedByParticipant = new Map<string, {
      participantEmail: string;
      participantWallet?: string;
      repositories: Array<{
        id: number;
        repoUrl: string;
        registeredAt: Date;
        isActive: boolean;
      }>;
    }>();

    repositories.entities.forEach((repo, index) => {
      const rawData = repositories.raw[index];
      const participantEmail = repo.user.github_email;
      const walletAddress = rawData.wallet_address;

      if (!groupedByParticipant.has(participantEmail)) {
        groupedByParticipant.set(participantEmail, {
          participantEmail,
          participantWallet: walletAddress || undefined,
          repositories: []
        });
      }

      groupedByParticipant.get(participantEmail)!.repositories.push({
        id: repo.id,
        repoUrl: repo.repo_url,
        registeredAt: repo.created_at,
        isActive: repo.is_active
      });
    });

    return Array.from(groupedByParticipant.values());
  }

  /**
   * 종료해야 할 스터디들 조회 (커밋 기록이 있고 종료 시간이 지난 스터디들)
   */
  async getStudiesToClose(): Promise<Array<{
    proxyAddress: string;
    studyName: string;
    studyDate: number; // 자정 타임스탬프
    studyEndTime: number;
  }>> {
    // 현재 UTC 시간
    const nowUTCTimestamp = Math.floor(Date.now() / 1000);

    // ACTIVE 상태인 StudySession들 조회 (종료 시간이 지난 것들)
    const activeStudySessions = await this.studySessionRepository.find({
      where: {
        status: StudySessionStatus.ACTIVE
      },
      relations: ['study']
    });

    const studiesToClose: Array<{
      proxyAddress: string;
      studyName: string;
      studyDate: number;
      studyEndTime: number;
    }> = [];

    for (const studySession of activeStudySessions) {
      const study = studySession.study;

      this.logger.log(`Processing session: study=${study.study_name}, date=${studySession.study_date}`);
      this.logger.log(`Study times: start=${study.study_start_time}s (${Math.floor(study.study_start_time/3600)}:${Math.floor((study.study_start_time%3600)/60)}), end=${study.study_end_time}s (${Math.floor(study.study_end_time/3600)}:${Math.floor((study.study_end_time%3600)/60)})`);

      // StudySession에 저장된 UTC 자정 타임스탬프 사용 (PostgreSQL bigint는 문자열로 반환되므로 Number 변환 필요)
      const studyMidnight = Number(studySession.study_midnight_utc);
      const endTimeNum = Number(study.study_end_time);

      let actualEndTime: number;

      if (endTimeNum >= 86400) {
        // 자정을 넘나드는 스터디 (예: 23:00 - 01:00)
        actualEndTime = studyMidnight + (endTimeNum % 86400);
        this.logger.log(`Overnight study: using midnight ${studyMidnight}`);
      } else {
        // 당일 완료 스터디 (예: 19:00 - 21:00)
        actualEndTime = studyMidnight + endTimeNum;
        this.logger.log(`Same-day study: using midnight ${studyMidnight}`);
      }

      this.logger.log(`Checking study: ${study.study_name}, endTime: ${endTimeNum >= 86400 ? 'overnight' : 'same-day'}`);
      this.logger.log(`studyMidnight: ${studyMidnight}, study_end_time: ${study.study_end_time}, actualEndTime: ${actualEndTime}`);

      // 안전한 ISO 변환
      try {
        const actualEndTimeISO = new Date(actualEndTime * 1000).toISOString();
        const nowISO = new Date(nowUTCTimestamp * 1000).toISOString();
        this.logger.log(`actualEndTime ISO: ${actualEndTimeISO}, now ISO: ${nowISO}`);
      } catch (error) {
        this.logger.error(`Invalid timestamp - actualEndTime: ${actualEndTime}, nowUTCTimestamp: ${nowUTCTimestamp}`);
        continue; // 이 스터디는 건너뛰기
      }

      if (nowUTCTimestamp > actualEndTime) {
        studiesToClose.push({
          proxyAddress: study.proxy_address,
          studyName: study.study_name,
          studyDate: studyMidnight, // 올바른 자정 timestamp 사용
          studyEndTime: study.study_end_time
        });
      }
    }

    return studiesToClose;
  }

  /**
   * StudySession 상태를 CLOSED로 업데이트 (스케줄러에서 성공적으로 close한 후 호출)
   */
  async markStudySessionClosed(proxyAddress: string, studyDate: number, blockchainTxHash?: string): Promise<void> {
    try {
      const studySession = await this.studySessionRepository.findOne({
        where: {
          study_midnight_utc: studyDate,
          status: StudySessionStatus.ACTIVE
        },
        relations: ['study']
      });

      if (!studySession || studySession.study.proxy_address !== proxyAddress) {
        this.logger.warn(`No active StudySession found for ${proxyAddress} on ${new Date(studyDate * 1000).toISOString()}`);
        return;
      }

      studySession.status = StudySessionStatus.CLOSED;
      studySession.closed_at = Math.floor(Date.now() / 1000);
      if (blockchainTxHash) {
        studySession.blockchain_tx_hash = blockchainTxHash;
      }

      await this.studySessionRepository.save(studySession);
      this.logger.log(`Marked StudySession as CLOSED: ${studySession.id} for study ${proxyAddress}`);

    } catch (error) {
      this.logger.error(`Failed to mark StudySession as closed`, error);
      throw error;
    }
  }

  /**
   * calculateStudyDate()와 동일한 로직으로 스케줄러용 자정 계산
   * @param currentTimestamp 현재 시간 (UTC Unix timestamp)
   * @param studyStartTime 스터디 시작 시간 (seconds from midnight in KST)
   * @param studyEndTime 스터디 종료 시간 (seconds from midnight in KST)
   * @returns UTC timestamp representing Korean midnight
   */
  private calculateStudyDateForScheduler(
    currentTimestamp: number,
    studyStartTime: number,
    studyEndTime: number
  ): number {
    // 현재 시간을 KST로 변환해서 날짜 확인
    const currentDateKST = new Date((currentTimestamp + 9 * 3600) * 1000);

    // 스터디가 자정을 넘나드는지 확인: 끝 offset이 24시간(86400초)을 넘으면 자정 넘나듦
    const isOvernight = Number(studyEndTime) >= 86400;

    let targetDate: Date;

    if (isOvernight) {
      // 자정을 넘나드는 스터디 (예: 22시-새벽2시 = 22시-26시)
      const currentHourKST = currentDateKST.getUTCHours();
      const endHour = Math.floor((Number(studyEndTime) % 86400) / 3600); // 새벽 시간

      if (currentHourKST <= endHour) {
        // 현재가 새벽이면 전날 자정 기준
        targetDate = new Date(currentDateKST);
        targetDate.setUTCDate(targetDate.getUTCDate() - 1);
      } else {
        // 현재가 저녁이면 당일 자정 기준
        targetDate = new Date(currentDateKST);
      }
    } else {
      // 자정을 넘나들지 않는 스터디 (예: 2시-3시)
      targetDate = new Date(currentDateKST);
    }

    // 한국 날짜의 자정을 UTC로 변환
    // 한국 자정 = UTC 전날 15:00 (오후 3시)
    // 예: 한국 10/8 자정 = UTC 10/7 오후 3시
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const date = targetDate.getUTCDate();

    // UTC 기준으로 해당 날짜 15:00 설정 (한국 다음날 자정)
    const koreanMidnightUTC = new Date(Date.UTC(year, month, date, 15, 0, 0, 0));

    // 하루 빼기 (한국 자정은 UTC 기준 전날 15시)
    koreanMidnightUTC.setUTCDate(koreanMidnightUTC.getUTCDate() - 1);

    return Math.floor(koreanMidnightUTC.getTime() / 1000);
  }

  /**
   * 전체 등록 현황 조회 (관리자용)
   */
  async getAllRegistrations(): Promise<any> {
    const studies = await this.studyRepository
      .createQueryBuilder('study')
      .leftJoinAndSelect('study.user_studies', 'us')
      .leftJoinAndSelect('us.user', 'user')
      .getMany();

    const result: any = {};

    studies.forEach(study => {
      result[study.proxy_address] = {
        studyName: study.study_name,
        participants: study.user_studies.map(us => ({
          walletAddress: us.wallet_address,
          githubEmail: us.user.github_email,
          registeredAt: us.registered_at,
        }))
      };
    });

    return result;
  }

  /**
   * 커밋 기록 저장 (하루에 첫 번째 커밋만 기록)
   */
  async recordCommit(data: {
    studyId: number;
    userId: number;
    studyDate: string; // 'YYYY-MM-DD'
    studyMidnightUtc: number; // UTC timestamp for Korean midnight
    commitTimestamp: number;
    commitId: string;
    commitMessage: string;
    walletAddress: string;
  }): Promise<{ isFirstCommit: boolean; isFirstStudyCommitToday: boolean; commitRecord?: CommitRecord }> {
    const { studyId, userId, studyDate, studyMidnightUtc, commitTimestamp, commitId, commitMessage, walletAddress } = data;

    // 1. StudySession 찾기 또는 생성
    let studySession = await this.studySessionRepository.findOne({
      where: {
        study_id: studyId,
        study_date: studyDate
      }
    });

    const isFirstStudyCommitToday = !studySession;

    if (!studySession) {
      // StudySession 생성
      studySession = this.studySessionRepository.create({
        study_id: studyId,
        study_date: studyDate,
        study_midnight_utc: studyMidnightUtc,
        started_at: commitTimestamp,
        status: StudySessionStatus.ACTIVE
      });
      await this.studySessionRepository.save(studySession);
      this.logger.log(`Created new study session for study ${studyId} on ${studyDate}`);
    }

    // 2. 사용자의 해당 세션 커밋 기록이 있는지 확인
    const existingRecord = await this.commitRecordRepository.findOne({
      where: {
        study_session_id: studySession.id,
        user_id: userId
      }
    });

    if (existingRecord) {
      this.logger.log(`Commit record already exists for user ${userId} in study session ${studySession.id}`);
      return { isFirstCommit: false, isFirstStudyCommitToday: false, commitRecord: existingRecord };
    }

    // 3. 새로운 커밋 기록 생성
    const commitRecord = this.commitRecordRepository.create({
      study_session_id: studySession.id,
      user_id: userId,
      commit_timestamp: commitTimestamp,
      commit_id: commitId,
      commit_message: commitMessage,
      wallet_address: walletAddress
    });

    const savedRecord = await this.commitRecordRepository.save(commitRecord);
    this.logger.log(`Recorded first commit for user ${userId} in study ${studyId} on ${studyDate} at ${new Date(commitTimestamp * 1000).toISOString()} (isFirstStudyCommitToday: ${isFirstStudyCommitToday})`);

    return { isFirstCommit: true, isFirstStudyCommitToday, commitRecord: savedRecord };
  }

  /**
   * 스터디별 커밋 기록 조회
   */
  async getStudyCommitRecords(proxyAddress: string): Promise<Array<{
    date: string;
    participantEmail: string;
    participantWallet: string;
    commitTime: Date;
    commitMessage: string;
    commitId: string;
  }>> {
    const records = await this.commitRecordRepository
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.user', 'user')
      .leftJoinAndSelect('cr.study_session', 'study_session')
      .leftJoinAndSelect('study_session.study', 'study')
      .where('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .orderBy('study_session.study_date', 'DESC')
      .addOrderBy('cr.commit_timestamp', 'ASC')
      .getMany();

    return records.map(record => ({
      date: record.study_session.study_date,
      participantEmail: record.user.github_email,
      participantWallet: record.wallet_address,
      commitTime: new Date(record.commit_timestamp * 1000),
      commitMessage: record.commit_message,
      commitId: record.commit_id
    }));
  }

  /**
   * 예치금 잔액 업데이트 (upsert)
   */
  async updateBalance(data: {
    userId: number;
    studyId: number;
    walletAddress: string;
    currentBalance: string;
  }): Promise<Balance> {
    // 기존 레코드 찾기
    let balanceRecord = await this.balanceRepository.findOne({
      where: { user_id: data.userId, study_id: data.studyId }
    });

    if (balanceRecord) {
      // 업데이트
      balanceRecord.current_balance = data.currentBalance;
      balanceRecord.wallet_address = data.walletAddress;
    } else {
      // 새로 생성
      balanceRecord = this.balanceRepository.create({
        user_id: data.userId,
        study_id: data.studyId,
        wallet_address: data.walletAddress,
        current_balance: data.currentBalance
      });
    }

    const savedRecord = await this.balanceRepository.save(balanceRecord);
    this.logger.log(`Updated balance: ${data.currentBalance} USDC for user ${data.userId} in study ${data.studyId}`);

    return savedRecord;
  }

  /**
   * 특정 스터디의 모든 참가자 예치금 현황 조회
   */
  async getStudyBalances(proxyAddress: string): Promise<Array<{
    userId: number;
    githubEmail: string;
    walletAddress: string;
    currentBalance: string;
    depositAmount: string;
    updatedAt: Date;
  }>> {
    // 스터디 조회
    const study = await this.studyRepository.findOne({
      where: { proxy_address: proxyAddress.toLowerCase() }
    });

    if (!study) {
      return [];
    }

    // 해당 스터디의 예치금 기록들 조회
    const balances = await this.balanceRepository
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.user', 'user')
      .where('b.study_id = :studyId', { studyId: study.id })
      .getMany();

    return balances.map(balance => ({
      userId: balance.user_id,
      githubEmail: balance.user.github_email,
      walletAddress: balance.wallet_address,
      currentBalance: balance.current_balance,
      depositAmount: study.deposit_amount,
      updatedAt: balance.updated_at
    }));
  }

  /**
   * 모든 스터디의 예치금 현황 조회 (통합 API)
   */
  async getAllStudyBalances(): Promise<Array<{
    studyId: number;
    studyName: string;
    proxyAddress: string;
    participants: Array<{
      userId: number;
      githubEmail: string;
      walletAddress: string;
      currentBalance: string;
      depositAmount: string;
      updatedAt: Date;
    }>;
  }>> {
    // 모든 스터디와 해당 예치금 기록들 조회
    const studies = await this.studyRepository
      .createQueryBuilder('study')
      .leftJoinAndSelect('study.balances', 'balance')
      .leftJoinAndSelect('balance.user', 'user')
      .orderBy('study.created_at', 'DESC')
      .addOrderBy('user.github_email', 'ASC')
      .getMany();

    return studies.map(study => ({
      studyId: study.id,
      studyName: study.study_name,
      proxyAddress: study.proxy_address,
      participants: study.balances?.map(balance => ({
        userId: balance.user_id,
        githubEmail: balance.user.github_email,
        walletAddress: balance.wallet_address,
        currentBalance: balance.current_balance,
        depositAmount: study.deposit_amount,
        updatedAt: balance.updated_at
      })) || []
    }));
  }

  /**
   * 특정 사용자의 스터디 참여 기록 조회
   */
  async getUserParticipations(githubEmail: string): Promise<Array<{
    id: number;
    studyName: string;
    proxyAddress: string;
    walletAddress: string;
    registeredAt: Date;
  }>> {
    const userStudies = await this.userStudyRepository
      .createQueryBuilder('us')
      .leftJoinAndSelect('us.user', 'user')
      .leftJoinAndSelect('us.study', 'study')
      .where('user.github_email = :githubEmail', { githubEmail })
      .orderBy('us.registered_at', 'DESC')
      .getMany();

    return userStudies.map(us => ({
      id: us.id,
      studyName: us.study.study_name,
      proxyAddress: us.study.proxy_address,
      walletAddress: us.wallet_address,
      registeredAt: us.registered_at
    }));
  }

  /**
   * 특정 사용자의 스터디 참여 기록 삭제
   */
  async removeUserParticipation(githubEmail: string, studyId?: number): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    try {
      let query = this.userStudyRepository
        .createQueryBuilder('us')
        .leftJoin('us.user', 'user')
        .where('user.github_email = :githubEmail', { githubEmail });

      if (studyId) {
        query = query.andWhere('us.study_id = :studyId', { studyId });
      }

      const participations = await query.getMany();

      if (participations.length === 0) {
        return {
          success: false,
          message: '삭제할 참여 기록이 없습니다.',
          deletedCount: 0
        };
      }

      const result = await this.userStudyRepository.remove(participations);

      this.logger.log(`Removed ${result.length} participation records for user ${githubEmail}`);

      return {
        success: true,
        message: `${result.length}개의 참여 기록이 삭제되었습니다.`,
        deletedCount: result.length
      };
    } catch (error) {
      this.logger.error('Failed to remove user participation:', error);
      return {
        success: false,
        message: `삭제 실패: ${error.message}`,
        deletedCount: 0
      };
    }
  }
}