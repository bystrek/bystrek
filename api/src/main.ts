import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CORS_ORIGINS, LOCALHOST_ORIGIN } from './env';
import { configureHttp } from './http/configure-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({
    origin: [...CORS_ORIGINS, LOCALHOST_ORIGIN],
    exposedHeaders: ['set-auth-token'],
  });

  configureHttp(app);

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
bootstrap();
