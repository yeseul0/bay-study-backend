import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly blockchainService: BlockchainService,
  ) {}

  /**
   * 매 시간마다 종료해야 할 스터디들 체크 및 종료 처리
   */
  @Cron('5 * * * *', { timeZone: 'Asia/Seoul' }) // KST 기준 매시 20분에 실행
  async handleStudyClosures() {
    try {
      this.logger.log('Checking for studies to close...');

      // 종료해야 할 스터디들 조회
      const studiesToClose = await this.databaseService.getStudiesToClose();

      if (studiesToClose.length === 0) {
        this.logger.log('No studies to close at this time');
        return;
      }

      this.logger.log(`Found ${studiesToClose.length} studies to close`);

      // 각 스터디별로 종료 처리
      for (const study of studiesToClose) {
        try {
          this.logger.log(`Closing study: ${study.studyName} (${study.proxyAddress}) for date ${new Date(study.studyDate * 1000).toISOString()}`);

          // 블록체인에 closeStudy 호출
          await this.blockchainService.closeStudy(study.proxyAddress, study.studyDate);

          // StudySession 상태를 CLOSED로 업데이트
          await this.databaseService.markStudySessionClosed(study.proxyAddress, study.studyDate);

          this.logger.log(`Successfully closed study: ${study.studyName}`);
        } catch (error) {
          this.logger.error(`Failed to close study ${study.studyName}:`, error);
          // 개별 스터디 종료 실패해도 다른 스터디들은 계속 처리
        }
      }

      this.logger.log(`Study closure check completed. Processed ${studiesToClose.length} studies`);
    } catch (error) {
      this.logger.error('Failed to check/close studies:', error);
    }
  }

  /**
   * 수동으로 스터디 종료 처리 트리거 (테스트용)
   */
  async triggerStudyClosures(): Promise<{ success: boolean; message: string; closedStudies?: any[] }> {
    try {
      this.logger.log('Manual trigger for study closures...');

      const studiesToClose = await this.databaseService.getStudiesToClose();

      if (studiesToClose.length === 0) {
        return {
          success: true,
          message: 'No studies to close at this time',
          closedStudies: [],
        };
      }

      const closedStudies: any[] = [];

      for (const study of studiesToClose) {
        try {
          await this.blockchainService.closeStudy(study.proxyAddress, study.studyDate);
          closedStudies.push({
            studyName: study.studyName,
            proxyAddress: study.proxyAddress,
            studyDate: study.studyDate,
            status: 'closed',
          });
        } catch (error) {
          closedStudies.push({
            studyName: study.studyName,
            proxyAddress: study.proxyAddress,
            studyDate: study.studyDate,
            status: 'failed',
            error: error.message
          });
        }
      }

      return {
        success: true,
        message: `Processed ${studiesToClose.length} studies`,
        closedStudies
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to trigger study closures: ${error.message}`
      };
    }
  }

  /**
   * 13분마다 셀프핑 (서버 잠들지 않도록)
   */
  @Cron('*/13 * * * *', { timeZone: 'Asia/Seoul' }) // KST 기준 매 13분마다 실행
  async selfPing() {
    try {
      const response = await fetch(process.env.GITHUB_WEBHOOK_URL?.replace('/github/webhook', '') || 'https://bay-study-backend.onrender.com');
      this.logger.log(`Self-ping successful: ${response.status} ${response.statusText}`);
    } catch (error) {
      this.logger.warn(`Self-ping failed: ${error.message}`);
    }
  }
}
