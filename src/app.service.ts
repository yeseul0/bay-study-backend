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
      const testProxyAddress = '0x1234567890123456789012345678901234567890';
      const testParticipantAddress = '0x0987654321098765432109876543210987654321';
      const todayMidnight = getTodayMidnightTimestamp();
      const currentTime = getCurrentUnixTimestamp();

      // startTodayStudy 먼저 호출
      await this.blockchainService.startTodayStudy(testProxyAddress, todayMidnight);

      // trackCommit 호출 (새로운 시그니처에 맞게)
      await this.blockchainService.trackCommit(testProxyAddress, testParticipantAddress, currentTime, todayMidnight);

      return `Contract call successful! Started study and tracked commit for ${testParticipantAddress} at ${currentTime}`;
    } catch (error) {
      return `Contract call failed: ${error.message}`;
    }
  }
}
