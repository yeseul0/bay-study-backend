import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';
import { CommitRecord } from '../entities/commit-record.entity';
import { Balance } from '../entities/balance.entity';

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
    // 외래키 제약조건 임시 비활성화
    await this.userRepository.query('SET FOREIGN_KEY_CHECKS = 0');

    // 모든 테이블 데이터 삭제 (외래키 순서 고려)
    await this.balanceRepository.clear();
    await this.commitRecordRepository.clear();
    await this.repositoryRepository.clear();
    await this.userStudyRepository.clear();
    await this.studyRepository.clear();
    await this.userRepository.clear();

    // 외래키 제약조건 다시 활성화
    await this.userRepository.query('SET FOREIGN_KEY_CHECKS = 1');

    this.logger.log('All data cleared');
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

    // 5. 관련 커밋 기록도 삭제 (선택사항)
    await this.commitRecordRepository.delete({
      study_id: study.id,
      user_id: user.id
    });

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
    // KST 기준 현재 시간
    const nowUTC = Date.now();
    const nowKST = nowUTC + 9 * 60 * 60 * 1000; // UTC + 9시간
    const nowKSTTimestamp = Math.floor(nowKST / 1000);

    // 1. KST 기준 오늘과 어제 날짜 계산
    const todayKST = new Date(nowKST);
    const yesterdayKST = new Date(nowKST);
    yesterdayKST.setDate(todayKST.getDate() - 1);

    const todayDate = todayKST.toISOString().split('T')[0]; // YYYY-MM-DD
    const yesterdayDate = yesterdayKST.toISOString().split('T')[0];

    // 2. 커밋 기록이 있는 스터디들 조회 (중복 제거)
    const commitRecords = await this.commitRecordRepository
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.study', 'study')
      .where('cr.date IN (:...dates)', { dates: [todayDate, yesterdayDate] })
      .getMany();

    // 중복 제거 (study_id + date 조합별로 하나씩만)
    const uniqueRecords = commitRecords.filter((record, index, self) =>
      index === self.findIndex(r =>
        r.study_id === record.study_id && r.date === record.date
      )
    );

    const studiesToClose: Array<{
      proxyAddress: string;
      studyName: string;
      studyDate: number;
      studyEndTime: number;
    }> = [];

    for (const record of uniqueRecords) {
      const study = record.study;
      const recordDate = record.date;

      this.logger.log(`Processing record: study=${study.study_name}, date=${recordDate}`);
      this.logger.log(`Study times: start=${study.study_start_time}s (${Math.floor(study.study_start_time/3600)}:${Math.floor((study.study_start_time%3600)/60)}), end=${study.study_end_time}s (${Math.floor(study.study_end_time/3600)}:${Math.floor((study.study_end_time%3600)/60)})`);

      // KST 기준 해당 날짜의 자정 타임스탬프 계산
      const studyDateKST = new Date(recordDate + 'T00:00:00');

      if (isNaN(studyDateKST.getTime())) {
        this.logger.error(`Invalid date: ${recordDate}, skipping...`);
        continue;
      }

      const studyDate = Math.floor(studyDateKST.getTime() / 1000);

      // 자정 넘나드는 스터디인지 확인 (끝 시간이 24시간 이상이면 자정 넘나듦)
      const isOvernight = study.study_end_time >= 86400;

      let actualEndTime: number;

      if (isOvernight) {
        // 자정 넘나드는 스터디: 다음날로 계산
        const nextDayMidnight = studyDate + 86400; // 다음날 자정
        const endTimeNextDay = (study.study_end_time % 86400); // 24시간 넘어간 부분
        actualEndTime = nextDayMidnight + endTimeNextDay;
      } else {
        // 당일 완료 스터디: 기존 방식
        actualEndTime = studyDate + study.study_end_time;
      }

      this.logger.log(`Checking study: ${study.study_name}, isOvernight: ${isOvernight}`);
      this.logger.log(`actualEndTime timestamp: ${actualEndTime}, ISO: ${new Date(actualEndTime * 1000).toISOString()}`);
      this.logger.log(`nowKSTTimestamp: ${nowKSTTimestamp}, ISO: ${new Date(nowKSTTimestamp * 1000).toISOString()}`);

      if (nowKSTTimestamp > actualEndTime) {
        studiesToClose.push({
          proxyAddress: study.proxy_address,
          studyName: study.study_name,
          studyDate,
          studyEndTime: study.study_end_time
        });
      }
    }

    return studiesToClose;
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
    date: string; // 'YYYY-MM-DD'
    commitTimestamp: number;
    commitId: string;
    commitMessage: string;
    walletAddress: string;
  }): Promise<{ isFirstCommit: boolean; isFirstStudyCommitToday: boolean; commitRecord?: CommitRecord }> {
    const { studyId, userId, date, commitTimestamp, commitId, commitMessage, walletAddress } = data;

    // 사용자의 해당 날짜 커밋 기록이 있는지 확인
    const existingRecord = await this.commitRecordRepository.findOne({
      where: {
        study_id: studyId,
        user_id: userId,
        date: date
      }
    });

    if (existingRecord) {
      this.logger.log(`Commit record already exists for user ${userId} in study ${studyId} on ${date}`);
      return { isFirstCommit: false, isFirstStudyCommitToday: false, commitRecord: existingRecord };
    }

    // 해당 스터디에서 오늘 첫 번째 커밋인지 확인 (모든 참가자 통틀어서)
    const todayStudyCommitCount = await this.commitRecordRepository.count({
      where: {
        study_id: studyId,
        date: date
      }
    });

    const isFirstStudyCommitToday = todayStudyCommitCount === 0;

    // 첫 번째 커밋이므로 기록
    const commitRecord = this.commitRecordRepository.create({
      study_id: studyId,
      user_id: userId,
      date: date,
      commit_timestamp: commitTimestamp,
      commit_id: commitId,
      commit_message: commitMessage,
      wallet_address: walletAddress
    });

    const savedRecord = await this.commitRecordRepository.save(commitRecord);
    this.logger.log(`Recorded first commit for user ${userId} in study ${studyId} on ${date} at ${new Date(commitTimestamp * 1000).toISOString()} (isFirstStudyCommitToday: ${isFirstStudyCommitToday})`);

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
      .leftJoinAndSelect('cr.study', 'study')
      .where('study.proxy_address = :proxyAddress', { proxyAddress: proxyAddress.toLowerCase() })
      .orderBy('cr.date', 'DESC')
      .addOrderBy('cr.commit_timestamp', 'ASC')
      .getMany();

    return records.map(record => ({
      date: record.date,
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