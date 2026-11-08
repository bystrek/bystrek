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
import { PlaceErrorsFilter } from './place-errors.filter';
import { PlaceDraftDto } from './place.dto';
import { PlacesDraftService } from './places-draft.service';

@Controller('places/draft')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(PlaceErrorsFilter)
export class PlacesDraftController {
  constructor(private readonly drafts: PlacesDraftService) {}

  // Nothing is saved: every outcome is a 200 the bar renders.
  @Post()
  @HttpCode(200)
  draft(@Body() body: PlaceDraftDto, @Req() req: Request) {
    return this.drafts.draft(req.session!.user.id, body.text);
  }
}
