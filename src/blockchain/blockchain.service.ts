import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { getTodayMidnightTimestamp, getUnixTimestamp } from '../utils/time.util';
import { StudyGroupABI } from './studygroupABI';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
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

      // Contract Address 설정 (환경변수에서 가져오기)
      const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');
      if (!contractAddress) {
        throw new Error('CONTRACT_ADDRESS environment variable is required');
      }

      this.contract = new ethers.Contract(contractAddress, StudyGroupABI.output.abi, this.wallet);

      this.logger.log('Blockchain service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service', error);
      throw error;
    }
  }

  /**
   * GitHub 커밋 정보를 받아서 컨트랙트의 trackCommit 함수를 호출
   * @param participantAddress 참가자의 이더리움 주소
   * @param commitTimestamp 커밋 시간 (ISO string 또는 Unix timestamp)
   */
  async trackCommit(participantAddress: string, commitTimestamp: string | number): Promise<void> {
    try {
      // 오늘 날짜의 00:00:00 UTC 타임스탬프 계산
      const todayMidnight = getTodayMidnightTimestamp();

      // 커밋 시간을 Unix 타임스탬프로 변환
      let commitTime: number;
      if (typeof commitTimestamp === 'string') {
        commitTime = getUnixTimestamp(new Date(commitTimestamp));
      } else {
        commitTime = commitTimestamp;
      }

      this.logger.log(`Calling trackCommit for participant ${participantAddress}`);
      this.logger.log(`Today midnight timestamp: ${todayMidnight}`);
      this.logger.log(`Commit timestamp: ${commitTime}`);

      // 컨트랙트의 trackCommit 함수 호출
      const tx = await this.contract.trackCommit(
        todayMidnight,        // 첫번째 인자: 오늘 날짜 00시 타임스탬프
        participantAddress,   // 두번째 인자: 참가자 주소
        commitTime           // 세번째 인자: 커밋 시간 타임스탬프
      );

      this.logger.log(`Transaction sent: ${tx.hash}`);

      // 트랜잭션 완료 대기
      const receipt = await tx.wait();
      this.logger.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    } catch (error) {
      this.logger.error('Failed to track commit on blockchain', error);
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