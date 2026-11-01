import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { withCalendarErrors } from './calendar-http-errors';
import { CalendarSyncService } from './calendar-sync.service';

// Progress of the first download of the user's calendar, polled by the UI until `ready`.
@Controller('calendar/sync')
@UseGuards(AuthGuard)
export class CalendarSyncController {
  constructor(private readonly sync: CalendarSyncService) {}

  @Get()
  async get(@Req() req: Request) {
    return withCalendarErrors(() => this.sync.progress(req.session!.user.id));
  }

  // Retries a failed download.
  @Post()
  async retry(@Req() req: Request) {
    return withCalendarErrors(() => this.sync.retry(req.session!.user.id));
  }
}
