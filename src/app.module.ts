import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { BlockchainService } from './blockchain/blockchain.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService, BlockchainService],
})
export class AppModule {}
