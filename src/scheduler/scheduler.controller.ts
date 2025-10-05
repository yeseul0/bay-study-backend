import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  /**
   * 수동으로 스터디 종료 처리 트리거 (테스트용)
   */
  @Post('trigger-close-studies')
  @HttpCode(HttpStatus.OK)
  async triggerCloseStudies(): Promise<{ success: boolean; message: string; closedStudies?: any[] }> {
    return await this.schedulerService.triggerStudyClosures();
  }
}