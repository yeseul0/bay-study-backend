import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyController } from './study.controller';
import { FactoryService } from '../blockchain/factory.service';
import { DatabaseService } from '../database/database.service';
import { GitHubService } from '../github/github.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuthModule } from '../auth/auth.module';
import { User } from '../entities/user.entity';
import { Study } from '../entities/study.entity';
import { UserStudy } from '../entities/user-study.entity';
import { Repository } from '../entities/repository.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Study, UserStudy, Repository]),
    AuthModule
  ],
  controllers: [StudyController],
  providers: [FactoryService, DatabaseService, GitHubService, BlockchainService],
  exports: [FactoryService, DatabaseService],
})
export class StudyModule {}