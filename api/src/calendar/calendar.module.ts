import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { llmClientProvider } from '../llm/llm.provider';
import { DbModule } from '../db/db.module';
import { CalendarAskController } from './calendar-ask.controller';
import { CalendarAskService } from './calendar-ask.service';
import { CalendarCredentialsController } from './calendar-credentials.controller';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [CalendarCredentialsController, CalendarEventsController, CalendarAskController],
  providers: [CalendarCredentialsService, CalendarService, CalendarAskService, llmClientProvider],
})
export class CalendarModule {}
