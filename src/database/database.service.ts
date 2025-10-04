import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';

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

    // 모든 테이블 데이터 삭제
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
   * 레포지토리 URL로 스터디 찾기
   */
  async findStudyByRepository(repoUrl: string): Promise<Study | null> {
    const repository = await this.repositoryRepository
      .createQueryBuilder('repo')
      .leftJoinAndSelect('repo.study', 'study')
      .where('repo.repo_url = :repoUrl', { repoUrl })
      .andWhere('repo.is_active = :isActive', { isActive: true })
      .getOne();

    return repository?.study || null;
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
}