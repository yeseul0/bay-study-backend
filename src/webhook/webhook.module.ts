import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ParticipantService } from '../storage/participant.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService, BlockchainService, ParticipantService],
  exports: [WebhookService],
})
export class WebhookModule {}
