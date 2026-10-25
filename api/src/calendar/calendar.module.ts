import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ollamaProvider } from '../chat/ollama.provider';
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
  providers: [CalendarCredentialsService, CalendarService, CalendarAskService, ollamaProvider],
})
export class CalendarModule {}
