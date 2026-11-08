import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PlaceErrorsFilter } from './place-errors.filter';
import { PlaceVisitsService } from './place-visits.service';

@Controller('places/:id/visit')
@UseGuards(AuthGuard)
@UseFilters(PlaceErrorsFilter)
export class PlaceVisitsController {
  constructor(private readonly visits: PlaceVisitsService) {}

  @Put()
  @HttpCode(204)
  mark(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.visits.mark(req.session!.user.id, id);
  }

  @Delete()
  @HttpCode(204)
  unmark(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.visits.unmark(req.session!.user.id, id);
  }
}
