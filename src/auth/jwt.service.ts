import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: number; // user id
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(userId: number, email: string): string {
    const payload: JwtPayload = {
      sub: userId,
      email: email,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '30d', // 30일 유효
    });
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify(token);
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }
}