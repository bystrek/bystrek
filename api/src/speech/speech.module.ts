import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import express from 'express';
import { AuthModule } from '../auth/auth.module';
import { MAX_AUDIO_BYTES, SpeechController } from './speech.controller';
import { whisperProvider } from './whisper.provider';

@Module({
  imports: [AuthModule],
  controllers: [SpeechController],
  providers: [whisperProvider],
})
export class SpeechModule implements NestModule {
  // Registered here rather than in main.ts so the route parses audio in every app,
  // including the integration tests' Nest app.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }))
      .forRoutes(SpeechController);
  }
}
