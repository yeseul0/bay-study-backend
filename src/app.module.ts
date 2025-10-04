import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { StudyModule } from './study/study.module';
import { BlockchainService } from './blockchain/blockchain.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    WebhookModule,
    StudyModule,
  ],
  controllers: [AppController],
  providers: [AppService, BlockchainService],
})
export class AppModule {}
