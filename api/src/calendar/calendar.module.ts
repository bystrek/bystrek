import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { CalendarCredentialsController } from './calendar-credentials.controller';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CALENDAR_TOOLS, calendarToolsProvider } from './calendar.tools';
import { CalendarService } from './calendar.service';
import { PendingCalendarActions } from './pending-actions';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [CalendarCredentialsController, CalendarEventsController],
  providers: [
    CalendarCredentialsService,
    CalendarService,
    PendingCalendarActions,
    calendarToolsProvider,
  ],
  exports: [CALENDAR_TOOLS],
})
export class CalendarModule {}
