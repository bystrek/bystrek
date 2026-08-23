import { Body, Controller, Delete, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarService } from './calendar.service';

class SetCredentialsDto {
  caldavUrl!: string;
  username!: string;
  password!: string;
  calendarUrl?: string;
  calendarDisplayName?: string;
}

class PreviewCalendarsDto {
  caldavUrl!: string;
  username!: string;
  password!: string;
}

@Controller('calendar/credentials')
@UseGuards(AuthGuard)
export class CalendarCredentialsController {
  constructor(
    private readonly credentials: CalendarCredentialsService,
    private readonly calendar: CalendarService,
  ) {}

  @Get()
  async get(@Req() req: Request) {
    return this.credentials.getDisplayable(req.session!.user.id);
  }

  // Connects with the given (not-yet-saved) credentials and lists the
  // account's calendars — lets the profile page offer a dropdown before
  // anything is persisted. Never touches the database.
  @Post('preview-calendars')
  async previewCalendars(@Body() body: PreviewCalendarsDto) {
    const calendars = await this.calendar.previewCalendars(
      body.caldavUrl,
      body.username,
      body.password,
    );
    return { calendars };
  }

  @Put()
  async set(@Body() body: SetCredentialsDto, @Req() req: Request) {
    await this.credentials.set(req.session!.user.id, {
      caldavUrl: body.caldavUrl,
      username: body.username,
      password: body.password,
      calendarUrl: body.calendarUrl ?? null,
      calendarDisplayName: body.calendarDisplayName ?? null,
    });
    return { ok: true };
  }

  @Delete()
  async remove(@Req() req: Request) {
    await this.credentials.remove(req.session!.user.id);
    return { ok: true };
  }
}
