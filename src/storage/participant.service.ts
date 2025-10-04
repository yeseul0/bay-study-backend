import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ParticipantInfo {
  walletAddress: string;
  githubEmail: string;
  registeredAt: Date;
}

export interface StudyParticipants {
  studyName?: string;
  participants: ParticipantInfo[];
}

@Injectable()
export class ParticipantService implements OnModuleInit {
  private readonly logger = new Logger(ParticipantService.name);
  private readonly dataFile = path.join(process.cwd(), 'data', 'participants.json');

  // 프록시 주소별로 참가자 관리: 프록시주소 -> 참가자 정보들
  private studies: Map<string, StudyParticipants> = new Map();

  async onModuleInit() {
    await this.loadFromFile();
  }

  /**
   * 파일에서 데이터 로드
   */
  private async loadFromFile(): Promise<void> {
    try {
      // data 디렉토리 생성
      const dataDir = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 파일이 존재하지 않으면 빈 객체로 초기화
      if (!fs.existsSync(this.dataFile)) {
        await this.saveToFile();
        this.logger.log('Created new participants data file');
        return;
      }

      const data = fs.readFileSync(this.dataFile, 'utf8');
      const studiesData: { [proxyAddress: string]: StudyParticipants } = JSON.parse(data);

      // Date 객체 복원
      for (const [proxyAddress, studyData] of Object.entries(studiesData)) {
        const restoredStudy: StudyParticipants = {
          studyName: studyData.studyName,
          participants: studyData.participants.map(participant => ({
            ...participant,
            registeredAt: new Date(participant.registeredAt)
          }))
        };
        this.studies.set(proxyAddress.toLowerCase(), restoredStudy);
      }

      this.logger.log(`Loaded ${this.studies.size} studies from file`);
    } catch (error) {
      this.logger.error('Failed to load participants from file', error);
      // 로드 실패시 빈 상태로 시작
      this.studies.clear();
    }
  }

  /**
   * 파일에 데이터 저장
   */
  private async saveToFile(): Promise<void> {
    try {
      const studiesData: { [proxyAddress: string]: StudyParticipants } = {};

      for (const [proxyAddress, studyData] of this.studies.entries()) {
        studiesData[proxyAddress] = studyData;
      }

      fs.writeFileSync(this.dataFile, JSON.stringify(studiesData, null, 2), 'utf8');
      this.logger.debug('Saved participants data to file');
    } catch (error) {
      this.logger.error('Failed to save participants to file', error);
    }
  }

  /**
   * 참가자 등록
   * @param walletAddress 지갑 주소
   * @param proxyAddress 스터디 프록시 주소
   * @param githubEmail GitHub 이메일
   * @param studyName 스터디 이름 (선택)
   */
  async registerParticipant(
    walletAddress: string,
    proxyAddress: string,
    githubEmail: string,
    studyName?: string,
  ): Promise<void> {
    const normalizedProxyAddress = proxyAddress.toLowerCase();
    const normalizedWalletAddress = walletAddress.toLowerCase();
    const normalizedEmail = githubEmail.toLowerCase();

    // 스터디가 없으면 생성
    if (!this.studies.has(normalizedProxyAddress)) {
      this.studies.set(normalizedProxyAddress, {
        studyName,
        participants: []
      });
    }

    const study = this.studies.get(normalizedProxyAddress)!;

    // 중복 등록 방지 (지갑 주소 또는 이메일 기준)
    const existsByWallet = study.participants.find(p => p.walletAddress === normalizedWalletAddress);
    const existsByEmail = study.participants.find(p => p.githubEmail === normalizedEmail);

    if (existsByWallet) {
      this.logger.warn(`Wallet ${walletAddress} already registered for study ${proxyAddress}`);
      return;
    }

    if (existsByEmail) {
      this.logger.warn(`Email ${githubEmail} already registered for study ${proxyAddress}`);
      return;
    }

    // 새 참가자 추가
    study.participants.push({
      walletAddress: normalizedWalletAddress,
      githubEmail: normalizedEmail,
      registeredAt: new Date(),
    });

    this.logger.log(`Registered participant ${walletAddress} (${githubEmail}) for study ${proxyAddress}`);

    // 파일에 저장
    await this.saveToFile();
  }

  /**
   * 프록시 주소로 참가자 목록 조회
   */
  getStudyParticipants(proxyAddress: string): ParticipantInfo[] {
    const study = this.studies.get(proxyAddress.toLowerCase());
    return study ? study.participants : [];
  }

  /**
   * 지갑 주소로 참여한 스터디 목록 조회
   */
  getParticipantStudies(walletAddress: string): Array<{ proxyAddress: string; studyName?: string; registeredAt: Date }> {
    const normalizedWalletAddress = walletAddress.toLowerCase();
    const result: Array<{ proxyAddress: string; studyName?: string; registeredAt: Date }> = [];

    for (const [proxyAddress, study] of this.studies.entries()) {
      const participant = study.participants.find(p => p.walletAddress === normalizedWalletAddress);
      if (participant) {
        result.push({
          proxyAddress,
          studyName: study.studyName,
          registeredAt: participant.registeredAt
        });
      }
    }

    return result;
  }

  /**
   * 특정 지갑이 특정 스터디에 참여했는지 확인
   */
  isParticipantInStudy(walletAddress: string, proxyAddress: string): boolean {
    const study = this.studies.get(proxyAddress.toLowerCase());
    if (!study) return false;

    return study.participants.some(p => p.walletAddress === walletAddress.toLowerCase());
  }

  /**
   * GitHub 이메일로 참가자 찾기
   */
  findParticipantByEmail(githubEmail: string): { participant: ParticipantInfo; proxyAddress: string; studyName?: string } | null {
    const normalizedEmail = githubEmail.toLowerCase();

    for (const [proxyAddress, study] of this.studies.entries()) {
      const participant = study.participants.find(p => p.githubEmail === normalizedEmail);
      if (participant) {
        return {
          participant,
          proxyAddress,
          studyName: study.studyName
        };
      }
    }

    return null;
  }

  /**
   * GitHub 이메일로 커밋할 수 있는 스터디 찾기
   */
  findStudyForCommitByEmail(githubEmail: string): { walletAddress: string; proxyAddress: string; studyName?: string } | null {
    const result = this.findParticipantByEmail(githubEmail);
    if (!result) return null;

    return {
      walletAddress: result.participant.walletAddress,
      proxyAddress: result.proxyAddress,
      studyName: result.studyName
    };
  }

  /**
   * 전체 등록 현황 조회 (관리자용)
   */
  getAllRegistrations(): { [proxyAddress: string]: StudyParticipants } {
    const result: { [proxyAddress: string]: StudyParticipants } = {};

    for (const [proxyAddress, study] of this.studies.entries()) {
      result[proxyAddress] = study;
    }

    return result;
  }

  /**
   * 등록 취소
   */
  async unregisterParticipant(walletAddress: string, proxyAddress: string): Promise<boolean> {
    const study = this.studies.get(proxyAddress.toLowerCase());
    if (!study) return false;

    const index = study.participants.findIndex(p => p.walletAddress === walletAddress.toLowerCase());
    if (index === -1) return false;

    study.participants.splice(index, 1);
    this.logger.log(`Unregistered participant ${walletAddress} from study ${proxyAddress}`);

    // 파일에 저장
    await this.saveToFile();
    return true;
  }
}