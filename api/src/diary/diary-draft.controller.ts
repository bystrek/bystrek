import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from '../auth/auth.guard';
import { DiaryDraftService } from './diary-draft.service';
import { DiaryErrorsFilter } from './diary-errors.filter';
import { DiaryDraftDto } from './diary.dto';

@Controller('diary/draft')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(DiaryErrorsFilter)
export class DiaryDraftController {
  constructor(private readonly drafts: DiaryDraftService) {}

  // Nothing is saved: every outcome is a 200 the bar renders.
  @Post()
  @HttpCode(200)
  draft(@Body() body: DiaryDraftDto, @Req() req: Request) {
    return this.drafts.draft(req.session!.user.id, body.text, body.capturedAt);
  }
}
