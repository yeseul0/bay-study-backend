import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthJwtService } from './jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: AuthJwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromCookie(request);

    console.log('🍪 Cookie token:', token ? `${token.substring(0, 20)}...` : 'none');

    if (!token) {
      console.log('❌ No JWT token found in cookies');
      throw new UnauthorizedException('No access token found');
    }

    try {
      const payload = this.jwtService.verifyToken(token);
      console.log('✅ JWT token verified for user:', payload.email);
      // 토큰에서 추출한 사용자 정보를 request 객체에 저장
      request['user'] = payload;
    } catch (error) {
      console.log('❌ JWT verification failed:', error.message);
      throw new UnauthorizedException('Invalid access token');
    }

    return true;
  }

  private extractTokenFromCookie(request: Request): string | undefined {
    return request.cookies?.access_token;
  }
}