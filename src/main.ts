import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser 미들웨어 추가
  app.use(cookieParser());

  // CORS 설정 (프론트엔드와 쿠키 공유를 위해)
  // 환경변수에서 허용할 Origin 목록 가져오기 (쉼표로 구분)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // origin이 없는 경우 (Postman 등) 또는 허용 목록에 있는 경우
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true, // 쿠키 전송 허용
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
