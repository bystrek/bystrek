import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CORS_ORIGINS } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: CORS_ORIGINS });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
