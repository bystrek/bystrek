import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { llmClientProvider } from '../llm/llm.provider';
import { UsersModule } from '../users/users.module';
import { DiaryCategoriesController } from './diary-categories.controller';
import { DiaryCategoriesService } from './diary-categories.service';
import { DiaryDraftController } from './diary-draft.controller';
import { DiaryDraftService } from './diary-draft.service';
import { DiaryEventsController } from './diary-events.controller';
import { DiaryEventsService } from './diary-events.service';
import { DiaryNotesController } from './diary-notes.controller';
import { DiaryNotesService } from './diary-notes.service';

@Module({
  imports: [DbModule, AuthModule, UsersModule],
  controllers: [
    DiaryDraftController,
    DiaryNotesController,
    DiaryEventsController,
    DiaryCategoriesController,
  ],
  providers: [
    DiaryDraftService,
    DiaryNotesService,
    DiaryEventsService,
    DiaryCategoriesService,
    llmClientProvider,
  ],
  exports: [DiaryEventsService, DiaryCategoriesService],
})
export class DiaryModule {}
