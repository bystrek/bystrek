import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { users } from '../db/schema';
import { CalendarAskService } from './calendar-ask.service';

export const MAX_QUESTION_LENGTH = 500;

class AskDto {
  question!: string;
}

function normaliseQuestion(body: AskDto | undefined): string {
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) throw new BadRequestException('"question" is required');
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new BadRequestException(`"question" must be at most ${MAX_QUESTION_LENGTH} characters`);
  }
  return question;
}

@Controller('calendar/ask')
@UseGuards(AuthGuard)
export class CalendarAskController {
  constructor(
    private readonly ask: CalendarAskService,
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  @Post()
  @HttpCode(200)
  async askQuestion(@Body() body: AskDto, @Req() req: Request) {
    const question = normaliseQuestion(body);
    const userId = req.session!.user.id;
    const timezone = await this.loadTimezone(userId);
    return this.ask.ask(userId, timezone, question);
  }

  private async loadTimezone(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new NotFoundException(`user ${userId} not found`);
    return row.timezone;
  }
}
