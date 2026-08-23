import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CalendarCredentialsService } from './calendar-credentials.service';

class SetCredentialsDto {
  caldavUrl!: string;
  username!: string;
  password!: string;
  calendarName?: string;
}

@Controller('calendar/credentials')
@UseGuards(AuthGuard)
export class CalendarCredentialsController {
  constructor(private readonly credentials: CalendarCredentialsService) {}

  @Get()
  async get(@Req() req: Request) {
    return this.credentials.getDisplayable(req.session!.user.id);
  }

  @Put()
  async set(@Body() body: SetCredentialsDto, @Req() req: Request) {
    await this.credentials.set(req.session!.user.id, {
      caldavUrl: body.caldavUrl,
      username: body.username,
      password: body.password,
      calendarName: body.calendarName ?? null,
    });
    return { ok: true };
  }

  @Delete()
  async remove(@Req() req: Request) {
    await this.credentials.remove(req.session!.user.id);
    return { ok: true };
  }
}
