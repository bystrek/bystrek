import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { LogCategoriesController } from './log-categories.controller';
import { LogCategoriesService } from './log-categories.service';
import { LogEventsController } from './log-events.controller';
import { LogEventsService } from './log-events.service';
import { LogNotesController } from './log-notes.controller';
import { LogNotesService } from './log-notes.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [LogNotesController, LogEventsController, LogCategoriesController],
  providers: [LogNotesService, LogEventsService, LogCategoriesService],
})
export class LogModule {}
