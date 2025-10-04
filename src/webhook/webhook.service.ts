import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ParticipantService } from '../storage/participant.service';
import { getUnixTimestamp } from '../utils/time.util';

export interface CommitData {
  commitId: string;
  message: string;
  timestamp: string;
  authorEmail: string;
  authorName: string;
  repositoryName: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly participantService: ParticipantService,
    private readonly configService: ConfigService,
  ) {}

  async processCommit(commitData: CommitData): Promise<void> {
    try {
      this.logger.log(`Processing commit: ${commitData.commitId}`);
      this.logger.log(`Author: ${commitData.authorName} (${commitData.authorEmail})`);
      this.logger.log(`Repository: ${commitData.repositoryName}`);
      this.logger.log(`Timestamp: ${commitData.timestamp}`);

      // GitHub 이메일로 참가자 찾기
      const participantStudy = this.participantService.findStudyForCommitByEmail(commitData.authorEmail);
      if (!participantStudy) {
        this.logger.warn(`No study found for email: ${commitData.authorEmail}`);
        return;
      }

      this.logger.log(`Found study for participant: ${participantStudy.proxyAddress} (wallet: ${participantStudy.walletAddress})`);

      // 지갑 주소 유효성 검사
      if (!this.blockchainService.isValidAddress(participantStudy.walletAddress)) {
        this.logger.warn(`Invalid Ethereum address: ${participantStudy.walletAddress}`);
        return;
      }

      // 커밋 시간을 Unix 타임스탬프로 변환
      const commitTimestamp = getUnixTimestamp(new Date(commitData.timestamp));

      // 블록체인에 커밋 기록 (등록된 스터디 프록시에, 참가자의 지갑 주소로)
      await this.blockchainService.trackCommit(participantStudy.walletAddress, commitTimestamp);

      this.logger.log(`Successfully tracked commit for ${participantStudy.walletAddress} (${commitData.authorEmail})`);
    } catch (error) {
      this.logger.error('Failed to process commit', error);
      throw error;
    }
  }
}
