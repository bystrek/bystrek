import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { NewPlaceDto, PlacePatchDto } from './place.dto';
import { PlacesService } from './places.service';

@Controller('places')
@UseGuards(AuthGuard)
@UsePipes(ZodValidationPipe)
@UseFilters(PlaceErrorsFilter)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.places.list(req.session!.user.id);
  }

  @Post()
  create(@Body() body: NewPlaceDto, @Req() req: Request) {
    return this.places.create(req.session!.user.id, body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: PlacePatchDto, @Req() req: Request) {
    return this.places.update(req.session!.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.places.remove(id);
  }
}
