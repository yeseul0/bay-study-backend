import { Controller, Post, Get, Body, Logger, HttpStatus, HttpCode, UseGuards, Headers } from '@nestjs/common';
import { GitHubService } from './github.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import type { JwtPayload } from '../auth/jwt.service';

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

@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(private readonly githubService: GitHubService) {}

  /**
   * 사용자의 GitHub 레포지토리 목록 조회
   */
  @Get('repositories')
  @UseGuards(JwtAuthGuard)
  async getUserRepositories(@CurrentUser() user: JwtPayload): Promise<{
    success: boolean;
    repositories?: Array<{
      id: number;
      name: string;
      fullName: string;
      description: string;
      htmlUrl: string;
      private: boolean;
      updatedAt: string;
    }>;
    message: string;
  }> {
    try {
      const repositories = await this.githubService.getUserRepositories(
        user.email,
      );

      return {
        success: true,
        repositories,
        message: `Found ${repositories.length} repositories`,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return {
          success: false,
          message: 'GitHub access token expired. Please login again.',
        };
      }

      return {
        success: false,
        message: `Failed to fetch repositories: ${error.message}`,
      };
    }
  }

  /**
   * GitHub 웹훅 처리 (커밋 추적)
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleGitHubWebhook(
    @Body() payload: GitHubWebhookPayload,
    @Headers('x-github-event') githubEvent: string,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`GitHub webhook received: ${githubEvent}`);

      // 웹훅 서명 검증
      const rawBody = JSON.stringify(payload);
      if (!this.githubService.verifyWebhookSignature(rawBody, signature)) {
        this.logger.error('Invalid webhook signature');
        return { success: false, message: 'Invalid signature' };
      }

      // GitHub에서 ping 이벤트인 경우
      if (payload.zen) {
        this.logger.log('GitHub ping event received');
        return { success: true, message: 'Ping received successfully' };
      }

      // push 이벤트가 아닌 경우 무시
      if (githubEvent !== 'push') {
        this.logger.log(`Ignoring ${githubEvent} event`);
        return { success: true, message: `${githubEvent} event ignored` };
      }

      // 커밋이 없는 경우
      if (!payload.commits || payload.commits.length === 0) {
        this.logger.log('No commits found in payload');
        return { success: true, message: 'No commits to process' };
      }

      this.logger.log(`Processing ${payload.commits.length} commits`);

      // 각 커밋에 대해 처리
      for (const commit of payload.commits) {
        await this.githubService.processCommit({
          commitId: commit.id,
          message: commit.message,
          timestamp: commit.timestamp,
          authorEmail: commit.author.email, // GitHub 이메일 사용
          authorName: commit.author.name,
          repositoryName: payload.repository?.full_name || 'unknown',
        });
      }

      return { success: true, message: 'Commits processed successfully' };
    } catch (error) {
      this.logger.error('Failed to process GitHub webhook', error);
      return { success: false, message: 'Failed to process webhook' };
    }
  }

  /**
   * 웹훅 테스트용 엔드포인트
   */
  @Post('webhook/test')
  @HttpCode(HttpStatus.OK)
  testWebhook(@Body() body: any): Promise<{ success: boolean; data: any }> {
    this.logger.log('Test webhook received');
    this.logger.log('Payload:', JSON.stringify(body, null, 2));
    return Promise.resolve({ success: true, data: body });
  }
}