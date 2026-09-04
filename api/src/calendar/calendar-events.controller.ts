import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { users } from '../db/schema';
import {
  CalendarEventNotFoundError,
  CalendarNotConfiguredError,
  CalendarService,
  CalendarUrlMismatchError,
} from './calendar.service';
import { parseZonedIso } from './zoned-time';

@Controller('calendar/events')
@UseGuards(AuthGuard)
export class CalendarEventsController {
  constructor(
    private readonly calendar: CalendarService,
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  @Get()
  async list(@Query('start') start: string, @Query('end') end: string, @Req() req: Request) {
    const timezone = await this.loadTimezone(req.session!.user.id);
    const range = this.parseRange(start, end, timezone);
    const events = await this.withErrorMapping(() =>
      this.calendar.listEvents(req.session!.user.id, range, timezone),
    );
    return { events };
  }

  @Get(':uid')
  async get(@Param('uid') uid: string, @Req() req: Request) {
    const timezone = await this.loadTimezone(req.session!.user.id);
    return this.withErrorMapping(() => this.calendar.getEvent(req.session!.user.id, uid, timezone));
  }

  private parseRange(start: string, end: string, timezone: string): { start: Date; end: Date } {
    if (!start || !end) {
      throw new BadRequestException('both "start" and "end" query params are required');
    }
    try {
      return { start: parseZonedIso(start, timezone), end: parseZonedIso(end, timezone) };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }

  private async loadTimezone(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new NotFoundException(`user ${userId} not found`);
    return row.timezone;
  }

  private async withErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CalendarEventNotFoundError) throw new NotFoundException(err.message);
      if (err instanceof CalendarNotConfiguredError) throw new BadRequestException(err.message);
      if (err instanceof CalendarUrlMismatchError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
