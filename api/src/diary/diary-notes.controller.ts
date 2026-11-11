import { Body, Controller, Post, Req, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '../auth/auth.guard';
import { DiaryErrorsFilter } from './diary-errors.filter';
import { DiaryNotesService } from './diary-notes.service';
import { NewDiaryNoteDto } from './diary.dto';

@Controller('diary/notes')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(DiaryErrorsFilter)
export class DiaryNotesController {
  constructor(private readonly notes: DiaryNotesService) {}

  @Post()
  create(@Body() body: NewDiaryNoteDto, @Req() req: Request) {
    return this.notes.create(req.session!.user.id, body);
  }
}
