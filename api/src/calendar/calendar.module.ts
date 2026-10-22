import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { CalendarCredentialsController } from './calendar-credentials.controller';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [CalendarCredentialsController, CalendarEventsController],
  providers: [CalendarCredentialsService, CalendarService],
})
export class CalendarModule {}
