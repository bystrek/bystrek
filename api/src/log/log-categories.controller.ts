import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { LogCategoriesService } from './log-categories.service';

@Controller('log/categories')
@UseGuards(AuthGuard)
export class LogCategoriesController {
  constructor(private readonly categories: LogCategoriesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.categories.list(req.session!.user.id);
  }
}
