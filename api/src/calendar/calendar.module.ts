import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { llmClientProvider } from '../llm/llm.provider';
import { DbModule } from '../db/db.module';
import { caldavFetchProvider, CaldavTransport } from './caldav-transport';
import { CalendarAskController } from './calendar-ask.controller';
import { CalendarAskService } from './calendar-ask.service';
import { CalendarCredentialsController } from './calendar-credentials.controller';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarDiscovery } from './calendar-discovery';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarService } from './calendar.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [
    CalendarCredentialsController,
    CalendarEventsController,
    CalendarSyncController,
    CalendarAskController,
  ],
  providers: [
    CalendarCredentialsService,
    CalendarDiscovery,
    caldavFetchProvider,
    CaldavTransport,
    CalendarSyncService,
    CalendarService,
    CalendarAskService,
    llmClientProvider,
  ],
})
export class CalendarModule {}
