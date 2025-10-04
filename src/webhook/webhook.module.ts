import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService, BlockchainService],
  exports: [WebhookService],
})
export class WebhookModule {}
