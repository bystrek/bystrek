import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CALENDAR_TOOLS } from '../calendar/calendar.tools';
import { DbModule } from '../db/db.module';
import { anthropicProvider } from './anthropic.provider';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CHAT_TOOLS, type ChatTool } from './chat.tools';

// Domains register their tools via their own module (calendar is the
// first — see docs/roadmap.md) and get combined into CHAT_TOOLS here.
const chatToolsProvider = {
  provide: CHAT_TOOLS,
  useFactory: (calendarTools: ChatTool[]) => [...calendarTools],
  inject: [CALENDAR_TOOLS],
};

@Module({
  imports: [DbModule, AuthModule, CalendarModule],
  controllers: [ChatController],
  providers: [ChatService, anthropicProvider, chatToolsProvider],
})
export class ChatModule {}
