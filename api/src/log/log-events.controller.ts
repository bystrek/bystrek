import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '../auth/auth.guard';
import { LogErrorsFilter } from './log-errors.filter';
import { LogEventsService } from './log-events.service';
import { EventPatchDto, EventRangeDto } from './log.dto';

@Controller('log/events')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(LogErrorsFilter)
export class LogEventsController {
  constructor(private readonly events: LogEventsService) {}

  @Get()
  list(@Query() range: EventRangeDto, @Req() req: Request) {
    return this.events.list(req.session!.user.id, range);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: EventPatchDto, @Req() req: Request) {
    return this.events.update(req.session!.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.events.remove(req.session!.user.id, id);
  }
}
