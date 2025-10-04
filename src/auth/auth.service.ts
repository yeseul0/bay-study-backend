import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { GitHubUserInfo } from './auth.controller';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async handleGitHubCallback(code: string): Promise<{
    user: User;
    githubUser: GitHubUserInfo;
    accessToken: string;
  }> {
    // 1. GitHub OAuth 토큰 교환
    const accessToken = await this.exchangeCodeForToken(code);

    // 2. GitHub 사용자 정보 가져오기
    const githubUser = await this.getGitHubUserInfo(accessToken);

    // 3. 데이터베이스에 사용자 저장 또는 업데이트
    const user = await this.saveOrUpdateUser(githubUser, accessToken);

    return { user, githubUser, accessToken };
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GITHUB_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth credentials not configured');
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    if (!data.access_token) {
      throw new Error('No access token received from GitHub');
    }

    this.logger.log('Successfully exchanged code for GitHub access token');
    return data.access_token;
  }

  async getGitHubUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Bay-Study-Backend',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const userData = await response.json();

    // 이메일이 public이 아닌 경우 별도 API 호출
    let email = userData.email;
    if (!email) {
      email = await this.getGitHubUserEmail(accessToken);
    }

    if (!email) {
      throw new Error('Unable to retrieve email from GitHub. Please make your email public or grant email scope.');
    }

    this.logger.log(`Retrieved GitHub user info for: ${userData.login} (${email})`);

    return {
      id: userData.id,
      login: userData.login,
      email: email,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
    };
  }

  private async getGitHubUserEmail(accessToken: string): Promise<string | null> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Bay-Study-Backend',
      },
    });

    if (!response.ok) {
      this.logger.warn('Failed to fetch user emails from GitHub');
      return null;
    }

    const emails = await response.json();

    // primary이면서 verified인 이메일 찾기
    const primaryEmail = emails.find((email: any) => email.primary && email.verified);
    if (primaryEmail) {
      return primaryEmail.email;
    }

    // primary가 없으면 verified인 첫 번째 이메일
    const verifiedEmail = emails.find((email: any) => email.verified);
    if (verifiedEmail) {
      return verifiedEmail.email;
    }

    return null;
  }

  private async saveOrUpdateUser(githubUser: GitHubUserInfo, accessToken: string): Promise<User> {
    // 이메일로 기존 사용자 찾기
    let user = await this.userRepository.findOne({
      where: { github_email: githubUser.email.toLowerCase() }
    });

    if (user) {
      // 기존 사용자 정보 업데이트
      user.github_access_token = accessToken;
      this.logger.log(`Updating existing user: ${githubUser.email}`);
    } else {
      // 새 사용자 생성
      user = this.userRepository.create({
        github_email: githubUser.email.toLowerCase(),
        github_access_token: accessToken,
      });
      this.logger.log(`Creating new user: ${githubUser.email}`);
    }

    user = await this.userRepository.save(user);
    this.logger.log(`User saved with ID: ${user.id}`);

    return user;
  }
}