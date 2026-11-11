import { Body, Controller, Post, Req, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '../auth/auth.guard';
import { LogErrorsFilter } from './log-errors.filter';
import { LogNotesService } from './log-notes.service';
import { NewNoteDto } from './log.dto';

@Controller('log/notes')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(LogErrorsFilter)
export class LogNotesController {
  constructor(private readonly notes: LogNotesService) {}

  @Post()
  create(@Body() body: NewNoteDto, @Req() req: Request) {
    return this.notes.create(req.session!.user.id, body);
  }
}
