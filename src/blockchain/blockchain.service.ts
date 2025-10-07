import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { getUnixTimestamp } from '../utils/time.util';
import { StudyGroupABI } from './studygroupABI';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;


  constructor(private configService: ConfigService) {
    this.initializeBlockchain();
  }

  private initializeBlockchain() {
    try {
      // RPC URL 설정 (환경변수에서 가져오기)
      const rpcUrl = this.configService.get<string>('RPC_URL') || 'http://localhost:8545';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // Private Key 설정 (환경변수에서 가져오기)
      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY environment variable is required');
      }
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      this.logger.log('Blockchain service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service', error);
      throw error;
    }
  }

  /**
   * 오늘 첫 번째 커밋인 경우 스터디 시작
   * @param proxyAddress 스터디 컨트랙트 주소
   * @param todayMidnight 오늘 자정 타임스탬프
   */
  async startTodayStudy(proxyAddress: string, todayMidnight: number): Promise<void> {
    try {
      this.logger.log(`Starting today's study for contract ${proxyAddress}`);
      this.logger.log(`Today midnight timestamp: ${todayMidnight}`);

      // 특정 스터디 컨트랙트에 연결
      const studyContract = new ethers.Contract(proxyAddress, StudyGroupABI, this.wallet);

      // 컨트랙트의 startTodayStudy 함수 호출
      const tx = await studyContract.startTodayStudy(todayMidnight);

      this.logger.log(`startTodayStudy transaction sent: ${tx.hash}`);

      // 트랜잭션 완료 대기
      const receipt = await tx.wait();
      this.logger.log(`startTodayStudy confirmed in block: ${receipt.blockNumber}`);

    } catch (error) {
      this.logger.error('Failed to start today study on blockchain', error);
      throw error;
    }
  }

  /**
   * GitHub 커밋 정보를 받아서 컨트랙트의 trackCommit 함수를 호출
   * @param proxyAddress 스터디 컨트랙트 주소
   * @param participantAddress 참가자의 이더리움 주소
   * @param commitTimestamp 커밋 시간 (Unix timestamp)
   * @param studyDate 스터디 날짜 (자정 타임스탬프)
   */
  async trackCommit(proxyAddress: string, participantAddress: string, commitTimestamp: number, studyDate: number): Promise<void> {
    try {
      this.logger.log(`Calling trackCommit for participant ${participantAddress} in study ${proxyAddress}`);
      this.logger.log(`Study date timestamp: ${studyDate} (${new Date(studyDate * 1000).toISOString()})`);
      this.logger.log(`Commit timestamp: ${commitTimestamp} (${new Date(commitTimestamp * 1000).toISOString()})`);

      // 특정 스터디 컨트랙트에 연결
      const studyContract = new ethers.Contract(proxyAddress, StudyGroupABI, this.wallet);

      // 컨트랙트의 trackCommit 함수 호출
      const tx = await studyContract.trackCommit(
        studyDate,            // 첫번째 인자: 스터디 날짜 00시 타임스탬프
        participantAddress,   // 두번째 인자: 참가자 주소
        commitTimestamp      // 세번째 인자: 커밋 시간 타임스탬프
      );

      this.logger.log(`trackCommit transaction sent: ${tx.hash}`);

      // 트랜잭션 완료 대기
      const receipt = await tx.wait();
      this.logger.log(`trackCommit confirmed in block: ${receipt.blockNumber}`);

    } catch (error) {
      this.logger.error('Failed to track commit on blockchain', error);
      throw error;
    }
  }

  /**
   * 스터디 종료 (벌금 계산 및 분배)
   * @param proxyAddress 스터디 컨트랙트 주소
   * @param studyDate 스터디 날짜 (자정 타임스탬프)
   */
  async closeStudy(proxyAddress: string, studyDate: number): Promise<void> {
    try {
      this.logger.log(`Closing study for contract ${proxyAddress} on date ${new Date(studyDate * 1000).toISOString()}`);

      // 특정 스터디 컨트랙트에 연결
      const studyContract = new ethers.Contract(proxyAddress, StudyGroupABI, this.wallet);

      // 현재 블록 시간 확인
      const latestBlock = await this.provider.getBlock('latest');
      if (!latestBlock) {
        throw new Error('Failed to get latest block');
      }
      const blockTimestamp = latestBlock.timestamp;
      this.logger.log(`Current block timestamp: ${blockTimestamp} (${new Date(blockTimestamp * 1000).toISOString()})`);
      this.logger.log(`Study timestamp: ${studyDate} (${new Date(studyDate * 1000).toISOString()})`);

      // 스터디 종료 시간 확인
      const studyEndTime = await studyContract.studyEndTime();
      const requiredEndTime = studyDate + Number(studyEndTime);
      this.logger.log(`Study end time offset: ${studyEndTime}`);
      this.logger.log(`Required end time: ${requiredEndTime} (${new Date(requiredEndTime * 1000).toISOString()})`);
      this.logger.log(`Block time > Required time? ${blockTimestamp} > ${requiredEndTime} = ${blockTimestamp > requiredEndTime}`);

      // 컨트랙트의 closeStudy 함수 호출
      const tx = await studyContract.closeStudy(studyDate);

      this.logger.log(`closeStudy transaction sent: ${tx.hash}`);

      // 트랜잭션 완료 대기
      const receipt = await tx.wait();
      this.logger.log(`closeStudy confirmed in block: ${receipt.blockNumber}`);

    } catch (error) {
      this.logger.error('Failed to close study on blockchain', error);
      throw error;
    }
  }

  /**
   * 참가자 주소 유효성 검사
   * @param address 이더리움 주소
   * @returns 유효한 주소인지 여부
   */
  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * 참가자의 현재 예치금 잔액 조회 (USDC 단위)
   * @param proxyAddress 스터디 컨트랙트 주소
   * @param participantAddress 참가자 주소
   * @returns USDC 단위 잔액
   */
  async getParticipantBalance(proxyAddress: string, participantAddress: string): Promise<string> {
    try {
      // 특정 스터디 컨트랙트에 연결
      const studyContract = new ethers.Contract(proxyAddress, StudyGroupABI, this.wallet);

      // 컨트랙트에서 balances 조회
      const balanceRaw = await studyContract.balances(participantAddress);

      // USDC는 6자리 소수점이므로 formatUnits 사용
      const balanceUSDC = ethers.formatUnits(balanceRaw, 6);

      this.logger.log(`Balance for ${participantAddress}: ${balanceUSDC} USDC`);
      return balanceUSDC;

    } catch (error) {
      this.logger.error(`Failed to get balance for ${participantAddress}`, error);
      throw error;
    }
  }

  /**
   * 모든 참가자의 예치금 잔액 조회
   * @param proxyAddress 스터디 컨트랙트 주소
   * @returns 참가자별 잔액 맵
   */
  async getAllParticipantBalances(proxyAddress: string): Promise<Record<string, string>> {
    try {
      const studyContract = new ethers.Contract(proxyAddress, StudyGroupABI, this.wallet);

      // 모든 참가자 목록 조회 - 우선 참가자 배열을 직접 조회하는 방식으로 수정
      let participantCount = 0;
      const participants: string[] = [];

      try {
        // participants 배열의 길이를 확인하기 위해 순차적으로 조회
        while (true) {
          const participant = await studyContract.participants(participantCount);
          participants.push(participant);
          participantCount++;
        }
      } catch {
        // 배열 끝에 도달하면 에러가 발생함
      }
      const balances: Record<string, string> = {};

      for (const participantAddress of participants) {
        const balanceRaw = await studyContract.balances(participantAddress);
        const balanceUSDC = ethers.formatUnits(balanceRaw, 6);
        balances[participantAddress] = balanceUSDC;
      }

      this.logger.log(`Retrieved balances for ${participantCount} participants`);
      return balances;

    } catch (error) {
      this.logger.error('Failed to get all participant balances', error);
      throw error;
    }
  }

  /**
   * 컨트랙트 연결 상태 확인
   * @returns 연결 상태
   */
  async getConnectionStatus(): Promise<{ connected: boolean; blockNumber?: number }> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      return { connected: true, blockNumber };
    } catch (error) {
      this.logger.error('Failed to get blockchain connection status', error);
      return { connected: false };
    }
  }
}