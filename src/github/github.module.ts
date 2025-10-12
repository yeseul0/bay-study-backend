import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { DatabaseService } from '../database/database.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthModule } from '../auth/auth.module';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';
import { CommitRecord } from '../entities/commit-record.entity';
import { Balance } from '../entities/balance.entity';
import { StudySession } from '../entities/study-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Study, UserStudy, Repository, CommitRecord, Balance, StudySession]),
    AuthModule,
  ],
  controllers: [GitHubController],
  providers: [GitHubService, DatabaseService, BlockchainService],
  exports: [GitHubService],
})
export class GitHubModule {}