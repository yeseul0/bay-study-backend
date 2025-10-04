import { Injectable } from '@nestjs/common';
import { BlockchainService } from './blockchain/blockchain.service';
import { getTodayMidnightTimestamp, getCurrentUnixTimestamp } from './utils/time.util';

@Injectable()
export class AppService {
  constructor(private readonly blockchainService: BlockchainService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async testContract(): Promise<string> {
    try {
      // 테스트용 이더리움 주소 (실제로는 유효한 참가자 주소여야 함)
      const testAddress = '0x1234567890123456789012345678901234567890';
      const todayMidnight = getTodayMidnightTimestamp();
      const currentTime = getCurrentUnixTimestamp();

      await this.blockchainService.trackCommit(testAddress, currentTime);

      return `Contract call successful! Tracked commit for ${testAddress} at ${currentTime}`;
    } catch (error) {
      return `Contract call failed: ${error.message}`;
    }
  }
}
