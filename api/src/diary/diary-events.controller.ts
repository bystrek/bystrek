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
import { DiaryErrorsFilter } from './diary-errors.filter';
import { DiaryEventsService } from './diary-events.service';
import { DiaryEventPatchDto, DiaryEventRangeDto } from './diary.dto';

@Controller('diary/events')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(DiaryErrorsFilter)
export class DiaryEventsController {
  constructor(private readonly events: DiaryEventsService) {}

  @Get()
  list(@Query() range: DiaryEventRangeDto, @Req() req: Request) {
    return this.events.list(req.session!.user.id, range);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DiaryEventPatchDto,
    @Req() req: Request,
  ) {
    return this.events.update(req.session!.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.events.remove(req.session!.user.id, id);
  }
}
