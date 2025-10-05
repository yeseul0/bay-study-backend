import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { DatabaseService } from '../database/database.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';
import { CommitRecord } from '../entities/commit-record.entity';
import { Balance } from '../entities/balance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Study, UserStudy, Repository, CommitRecord, Balance]),
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, DatabaseService, BlockchainService],
  exports: [SchedulerService],
})
export class SchedulerModule {}