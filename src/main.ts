import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser 미들웨어 추가
  app.use(cookieParser());

  // CORS 설정 (프론트엔드와 쿠키 공유를 위해)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true, // 쿠키 전송 허용
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
