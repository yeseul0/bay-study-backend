import { Controller, Post, Body, Logger, HttpCode, HttpStatus, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthJwtService } from './jwt.service';

export interface GitHubOAuthCallbackDto {
  code: string;
  state?: string;
}

export interface GitHubUserInfo {
  id: number;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: AuthJwtService,
  ) {}

  @Get('github/callback')
  async handleGitHubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      this.logger.log('GitHub OAuth callback received');
      this.logger.log(`Authorization code: ${code?.substring(0, 10)}...`);

      if (!code) {
        this.logger.error('No authorization code received');
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=no_code`);
      }

      // GitHub OAuth 토큰 교환 및 유저 정보 가져오기
      const result = await this.authService.handleGitHubCallback(code);

      this.logger.log(`User authenticated successfully: ${result.user.github_email}`);

      // JWT 토큰 생성
      const token = this.jwtService.generateAccessToken(result.user.id, result.user.github_email);

      // JWT를 httpOnly 쿠키로 설정
      this.logger.log(`Setting JWT cookie for user: ${result.user.github_email}`);
      res.cookie('access_token', token, {
        httpOnly: true, // XSS 공격 방지
        secure: process.env.NODE_ENV === 'production', // HTTPS에서만 전송
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 배포시 cross-site 허용
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
        domain: process.env.NODE_ENV === 'production' ? undefined : 'localhost', // 로컬에서는 명시적 도메인
      });

      // 성공시 프론트엔드 대시보드로 리다이렉트
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard`;

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error('GitHub OAuth callback failed', error);

      // 실패시 프론트엔드 에러 페이지로 리다이렉트
      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?` +
        `error=${encodeURIComponent(error.message)}`;

      return res.redirect(errorUrl);
    }
  }

  @Post('github/user-info')
  @HttpCode(HttpStatus.OK)
  async getGitHubUserInfo(@Body() body: { accessToken: string }): Promise<{
    success: boolean;
    user?: GitHubUserInfo;
    message: string;
  }> {
    try {
      this.logger.log('Getting GitHub user info with access token');

      const userInfo = await this.authService.getGitHubUserInfo(body.accessToken);

      return {
        success: true,
        user: userInfo,
        message: 'User info retrieved successfully'
      };
    } catch (error) {
      this.logger.error('Failed to get GitHub user info', error);
      return {
        success: false,
        message: `Failed to get user info: ${error.message}`
      };
    }
  }
}