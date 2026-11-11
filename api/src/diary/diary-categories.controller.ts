import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DiaryCategoriesService } from './diary-categories.service';

@Controller('diary/categories')
@UseGuards(AuthGuard)
export class DiaryCategoriesController {
  constructor(private readonly categories: DiaryCategoriesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.categories.list(req.session!.user.id);
  }
}
