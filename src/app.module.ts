import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GitHubModule } from './github/github.module';
import { StudyModule } from './study/study.module';
import { AuthModule } from './auth/auth.module';
import { BlockchainService } from './blockchain/blockchain.service';
import { User } from './entities/user.entity';
import { Study } from './entities/study.entity';
import { UserStudy } from './entities/user-study.entity';
import { Repository } from './entities/repository.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'bay_study',
      entities: [User, Study, UserStudy, Repository],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    GitHubModule,
    StudyModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, BlockchainService],
})
export class AppModule {}
