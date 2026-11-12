import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { DiaryModule } from '../diary/diary.module';
import { HealthImportController } from './health-import.controller';
import { HealthImportService } from './health-import.service';
import { HealthImportsService } from './health-imports.service';

@Module({
  imports: [DbModule, AuthModule, DiaryModule],
  controllers: [HealthImportController],
  providers: [HealthImportService, HealthImportsService],
})
export class HealthModule {}
