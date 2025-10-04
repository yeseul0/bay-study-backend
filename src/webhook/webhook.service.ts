import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import { getUnixTimestamp } from '../utils/time.util';

export interface CommitData {
  commitId: string;
  message: string;
  timestamp: string;
  authorAddress: string;
  authorName: string;
  repositoryName: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
  ) {}

  async processCommit(commitData: CommitData): Promise<void> {
    try {
      this.logger.log(`Processing commit: ${commitData.commitId}`);
      this.logger.log(`Author: ${commitData.authorName} (${commitData.authorAddress})`);
      this.logger.log(`Repository: ${commitData.repositoryName}`);
      this.logger.log(`Timestamp: ${commitData.timestamp}`);

      // 주소 유효성 검사
      if (!this.blockchainService.isValidAddress(commitData.authorAddress)) {
        this.logger.warn(`Invalid Ethereum address: ${commitData.authorAddress}`);
        return;
      }

      // 커밋 시간을 Unix 타임스탬프로 변환
      const commitTimestamp = getUnixTimestamp(new Date(commitData.timestamp));

      // 블록체인에 커밋 기록
      await this.blockchainService.trackCommit(commitData.authorAddress, commitTimestamp);

      this.logger.log(`Successfully tracked commit for ${commitData.authorAddress}`);
    } catch (error) {
      this.logger.error('Failed to process commit', error);
      throw error;
    }
  }
}
