import { Controller, Post, Body, Logger, HttpStatus, HttpCode } from '@nestjs/common';
import { WebhookService } from './webhook.service';

export interface GitHubWebhookPayload {
  // ping 이벤트용
  zen?: string;

  // push 이벤트용
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
  }>;
  pusher?: {
    name: string;
    email: string;
  };

  // 공통
  repository?: {
    id: number;
    name: string;
    full_name: string;
    owner?: {
      login: string;
      id: number;
    };
  };
  sender?: {
    login: string;
    id: number;
  };
}

@Controller('attendance')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('github')
  @HttpCode(HttpStatus.OK)
  async handleGitHubWebhook(@Body() payload: GitHubWebhookPayload): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('GitHub webhook received');

      // GitHub에서 ping 이벤트인 경우
      if (payload.zen) {
        this.logger.log('GitHub ping event received');
        return { success: true, message: 'Ping received successfully' };
      }

      // 커밋이 없는 경우
      if (!payload.commits || payload.commits.length === 0) {
        this.logger.log('No commits found in payload');
        return { success: true, message: 'No commits to process' };
      }

      this.logger.log(`Processing ${payload.commits.length} commits`);

      // 각 커밋에 대해 처리
      for (const commit of payload.commits) {
        await this.webhookService.processCommit({
          commitId: commit.id,
          message: commit.message,
          timestamp: commit.timestamp,
          authorEmail: commit.author.email, // GitHub 이메일 사용
          authorName: commit.author.name,
          repositoryName: payload.repository?.full_name || 'unknown'
        });
      }

      return { success: true, message: 'Commits processed successfully' };
    } catch (error) {
      this.logger.error('Failed to process GitHub webhook', error);
      return { success: false, message: 'Failed to process webhook' };
    }
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Body() body: any): Promise<{ success: boolean; data: any }> {
    this.logger.log('Test webhook received');
    this.logger.log('Payload:', JSON.stringify(body, null, 2));
    return { success: true, data: body };
  }
}