import { Controller, Post, Get, Body, Logger, HttpStatus, HttpCode, UseGuards, Headers } from '@nestjs/common';
import { GitHubService } from './github.service';
import { DatabaseService } from '../database/database.service';
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
    html_url: string;
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

  constructor(
    private readonly githubService: GitHubService,
    private readonly databaseService: DatabaseService,
  ) {}

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

      // 즉시 응답 (GitHub 타임아웃 방지)
      const response = { success: true, message: 'Webhook received, processing commits...' };

      // 백그라운드에서 비동기 처리
      setImmediate(async () => {
        try {
          if (payload.commits && payload.commits.length > 0) {
            for (const commit of payload.commits) {
              await this.githubService.processCommit({
                commitId: commit.id,
                message: commit.message,
                timestamp: commit.timestamp,
                authorEmail: commit.author.email,
                authorName: commit.author.name,
                repositoryName: payload.repository?.html_url || 'unknown',
              });
            }
            this.logger.log(`Successfully processed ${payload.commits.length} commits in background`);
          } else {
            this.logger.log('No commits to process in background');
          }
        } catch (error) {
          this.logger.error('Background commit processing failed', error);
        }
      });

      return response;
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
    this.logger.log('🎯 Test webhook received!');

    // 기본 정보 로그
    this.logger.log(`📦 Repository: ${body.repository?.full_name || 'Unknown'}`);
    this.logger.log(`🌐 Repository URL: ${body.repository?.html_url || 'Unknown'}`);
    this.logger.log(`👤 Sender: ${body.sender?.login || 'Unknown'}`);

    // 커밋 정보 로그 (있으면)
    if (body.commits && body.commits.length > 0) {
      this.logger.log(`📝 Commits found: ${body.commits.length}`);
      body.commits.forEach((commit: any, index: number) => {
        this.logger.log(`  📌 Commit ${index + 1}:`);
        this.logger.log(`    ID: ${commit.id?.substring(0, 8) || 'Unknown'}`);
        this.logger.log(`    Author: ${commit.author?.name || 'Unknown'} (${commit.author?.email || 'Unknown'})`);
        this.logger.log(`    Message: ${commit.message || 'No message'}`);
        this.logger.log(`    Timestamp: ${commit.timestamp || 'Unknown'}`);
      });
    } else {
      this.logger.log('📝 No commits in payload');
    }

    // ping 이벤트인지 확인
    if (body.zen) {
      this.logger.log(`🏓 Ping event received! Zen: "${body.zen}"`);
    }


    // 레포지토리 URL로 등록된 스터디들 확인
    if (body.repository?.html_url) {

      // 비동기로 스터디 찾기
      setImmediate(async () => {
        try {
          const studies = await this.databaseService.findStudiesByRepository(body.repository.html_url);
          if (studies.length > 0) {
            this.logger.log(`Found ${studies.length} studies for repository`);
          }
        } catch (error) {
          this.logger.error('Failed to find studies for repository', error);
        }
      });
    }

    return Promise.resolve({ success: true, data: body });
  }
}