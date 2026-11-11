import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CalendarAskService } from '../../core/calendar/calendar-ask.service';
import {
  DiaryDraftResponse,
  DiaryEventSource,
  DiaryService,
  NewDiaryNote,
} from '../../core/diary/diary.service';
import { AskBarStore } from './ask-bar-store';
import { LogBarStore } from './log-bar-store';
import { TimelineBar } from './timeline-bar';
import { TimelineStore } from './timeline-store';

const NOTE = 'dishwasher on';

const draft: DiaryDraftResponse = {
  kind: 'draft',
  events: [
    {
      text: 'Put the dishwasher on',
      occurredAt: '2026-11-11T17:00:00.000Z',
      endsAt: null,
      categoryId: null,
      extractorVersion: 'v1',
    },
  ],
  newCategories: [],
};

const render = async (response: DiaryDraftResponse = draft) => {
  const diary = {
    draft: vi.fn(() => of(response)),
    listCategories: vi.fn(async () => []),
    createNote: vi.fn(async (note: NewDiaryNote) =>
      note.events.map((event, i) => ({
        ...event,
        id: `e${i}`,
        noteId: 'n1',
        source: DiaryEventSource.MANUAL,
        category: null,
      })),
    ),
  };
  const ask = vi.fn(() => of({ kind: 'text', text: 'Nothing else today.' }));
  TestBed.configureTestingModule({
    providers: [
      AskBarStore,
      LogBarStore,
      { provide: DiaryService, useValue: diary },
      { provide: CalendarAskService, useValue: { ask } },
      { provide: TimelineStore, useValue: { timezone: () => 'Europe/Warsaw', jumpToDay: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(TimelineBar);
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  const field = () => el.querySelector<HTMLInputElement>('input.field')!;
  const type = async (text: string) => {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await settle();
  };
  // Enter in the bar's input submits its form.
  const enter = async () => {
    field().form!.requestSubmit();
    await settle();
  };
  const mode = async (name: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((b) => b.textContent?.trim() === name)!
      .click();
    await settle();
  };
  return { el, diary, ask, field, type, enter, mode, settle };
};

describe('TimelineBar', () => {
  it('keeps the typed text when switching modes', async () => {
    const ui = await render();

    await ui.type(NOTE);
    await ui.mode('log');
    expect(ui.field().value).toBe(NOTE);
    expect(ui.field().placeholder).toBe('log what happened…');

    await ui.mode('ask');
    expect(ui.field().value).toBe(NOTE);
    expect(ui.field().placeholder).toBe('ask your calendar…');
  });

  it('asks the calendar in ask mode', async () => {
    const ui = await render();

    await ui.type('anything else today?');
    await ui.enter();

    expect(ui.ask).toHaveBeenCalledWith('anything else today?');
    expect(ui.diary.draft).not.toHaveBeenCalled();
    expect(ui.field().value).toBe('');
  });

  it('drafts on the first Enter and logs on the second', async () => {
    const ui = await render();
    await ui.mode('log');

    await ui.type(NOTE);
    await ui.enter();
    expect(ui.diary.draft).toHaveBeenCalledWith(NOTE, expect.any(String));
    expect(ui.el.querySelector<HTMLInputElement>('app-log-bar form.draft input')?.value).toBe(
      'Put the dishwasher on',
    );
    expect(ui.field().value).toBe(NOTE);

    await ui.enter();
    expect(ui.diary.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: NOTE,
        events: [expect.objectContaining({ text: 'Put the dishwasher on' })],
      }),
    );
    expect(ui.field().value).toBe('');
    expect(ui.el.querySelector('form.draft')).toBeNull();
  });

  it('drafts again when the note was changed after the draft', async () => {
    const ui = await render();
    await ui.mode('log');
    await ui.type(NOTE);
    await ui.enter();

    await ui.type(`${NOTE} at 7`);
    await ui.enter();

    expect(ui.diary.draft).toHaveBeenCalledTimes(2);
    expect(ui.diary.createNote).not.toHaveBeenCalled();
  });

  it('ignores a blank proposed category once no event is in it', async () => {
    const ui = await render({
      ...draft,
      events: [{ ...draft.events[0], newCategory: 'chores' }],
      newCategories: [{ name: 'chores', description: null }],
    });
    await ui.mode('log');
    await ui.type(NOTE);
    await ui.enter();

    const name = ui.el.querySelector<HTMLInputElement>('[aria-label="Category name"]')!;
    name.value = '';
    name.dispatchEvent(new Event('input'));
    const category = ui.el.querySelector<HTMLSelectElement>('[aria-label="Category"]')!;
    category.value = '';
    category.dispatchEvent(new Event('input'));
    await ui.enter();

    expect(ui.diary.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ newCategories: [] }),
    );
  });

  it('does not log an event left blank', async () => {
    const ui = await render();
    await ui.mode('log');
    await ui.type(NOTE);
    await ui.enter();

    const text = ui.el.querySelector<HTMLInputElement>('form.draft input')!;
    text.value = '';
    text.dispatchEvent(new Event('input'));
    await ui.enter();

    expect(ui.diary.createNote).not.toHaveBeenCalled();
    expect(ui.el.querySelector('.field-error')?.textContent).toBe('Say what happened.');
    expect(ui.field().value).toBe(NOTE);
  });
});
