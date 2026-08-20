import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { anthropicProvider } from './anthropic.provider';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { chatToolsProvider } from './chat.tools';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, anthropicProvider, chatToolsProvider],
})
export class ChatModule {}
