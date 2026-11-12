import { Body, Controller, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { HealthImportDto } from './health-import.dto';
import { HealthImportService } from './health-import.service';

// Where the Health Auto Export app's REST API automation pushes, with a personal API token.
@Controller('health')
@UseGuards(ApiTokenGuard)
@UsePipes(ZodValidationPipe)
export class HealthImportController {
  constructor(private readonly health: HealthImportService) {}

  @Post('import')
  import(@Body() body: HealthImportDto, @Req() req: Request) {
    return this.health.import(req.apiTokenUserId!, body);
  }
}
