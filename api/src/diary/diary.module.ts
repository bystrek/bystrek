import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { DiaryCategoriesController } from './diary-categories.controller';
import { DiaryCategoriesService } from './diary-categories.service';
import { DiaryEventsController } from './diary-events.controller';
import { DiaryEventsService } from './diary-events.service';
import { DiaryNotesController } from './diary-notes.controller';
import { DiaryNotesService } from './diary-notes.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [DiaryNotesController, DiaryEventsController, DiaryCategoriesController],
  providers: [DiaryNotesService, DiaryEventsService, DiaryCategoriesService],
})
export class DiaryModule {}
