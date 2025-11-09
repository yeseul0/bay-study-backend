import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GitHubModule } from './github/github.module';
import { StudyModule } from './study/study.module';
import { AuthModule } from './auth/auth.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { BlockchainService } from './blockchain/blockchain.service';
import { User } from './entities/user.entity';
import { Study } from './entities/study.entity';
import { UserStudy } from './entities/user-study.entity';
import { Repository } from './entities/repository.entity';
import { CommitRecord } from './entities/commit-record.entity';
import { Balance } from './entities/balance.entity';
import { StudySession } from './entities/study-session.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(process.env.DATABASE_URL
        ? { url: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '6543'),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }
      ),
      entities: [User, Study, UserStudy, Repository, CommitRecord, Balance, StudySession],
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: { rejectUnauthorized: false },
    }),
    GitHubModule,
    StudyModule,
    AuthModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService, BlockchainService],
})
export class AppModule {}
