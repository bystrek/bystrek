import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { CalendarAskController, MAX_QUESTION_LENGTH } from './calendar-ask.controller';
import type { CalendarAskService } from './calendar-ask.service';

const req = { session: { user: { id: 'user-1' } } } as unknown as Request;

function controller() {
  const ask = mock();
  const db = {};
  return {
    ask,
    controller: new CalendarAskController(ask as unknown as CalendarAskService, db as never),
  };
}

describe('CalendarAskController', () => {
  it('rejects an empty or whitespace-only question before calling the model', async () => {
    const { ask, controller: c } = controller();

    await expect(c.askQuestion({ question: '   ' }, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ask).not.toHaveBeenCalled();
  });

  it('rejects a question over the length limit', async () => {
    const { controller: c } = controller();

    await expect(
      c.askQuestion({ question: 'x'.repeat(MAX_QUESTION_LENGTH + 1) }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
