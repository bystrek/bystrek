import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Temporal } from '@js-temporal/polyfill';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  DiaryCategory,
  DiaryDraftResponse,
  DiaryEvent,
  DiaryEventSource,
  DiaryService,
  NewDiaryNote,
} from '../../core/diary/diary.service';
import { LogBarStore, LogPhase } from './log-bar-store';
import { withoutCategory, withoutEvent } from './log-draft';
import { TimelineStore } from './timeline-store';

const TZ = 'Europe/Warsaw';
const NOTE = 'took 5g creatine, dishwasher on';
const VERSION = 'diary-draft@abc/model';

const supplement: DiaryCategory = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  name: 'supplement',
  description: null,
  parentId: null,
};

const draft: DiaryDraftResponse = {
  kind: 'draft',
  events: [
    {
      text: 'Took 5 g creatine',
      occurredAt: '2026-11-11T07:30:00.000Z',
      endsAt: null,
      categoryId: supplement.id,
      extractorVersion: VERSION,
    },
    {
      text: 'Put the dishwasher on',
      occurredAt: '2026-11-11T07:31:00.000Z',
      endsAt: null,
      categoryId: null,
      newCategory: 'chores',
      extractorVersion: VERSION,
    },
  ],
  newCategories: [{ name: 'chores', description: 'Housework' }],
};

const saved = (note: NewDiaryNote): DiaryEvent[] =>
  note.events.map((event, i) => ({
    id: `e${i}`,
    noteId: 'n1',
    text: event.text,
    occurredAt: event.occurredAt,
    endsAt: event.endsAt,
    source: DiaryEventSource.MANUAL,
    category: null,
  }));

type Api = {
  draft?: (text: string, capturedAt: string) => Observable<DiaryDraftResponse>;
  createNote?: (note: NewDiaryNote) => Promise<DiaryEvent[]>;
};

const setup = (api: Api = {}) => {
  const diary = {
    draft: vi.fn(api.draft ?? (() => of(draft))),
    listCategories: vi.fn(async () => [supplement]),
    createNote: vi.fn(api.createNote ?? (async (note: NewDiaryNote) => saved(note))),
  };
  const timeline = { timezone: () => TZ, jumpToDay: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      LogBarStore,
      { provide: DiaryService, useValue: diary },
      { provide: TimelineStore, useValue: timeline },
    ],
  });
  return { store: TestBed.inject(LogBarStore), diary, timeline };
};

// Lets the categories promise inside the draft resolve.
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('LogBarStore', () => {
  it('drafts a note into editable events in the account timezone', async () => {
    const { store, diary } = setup();

    store.submit(NOTE);
    expect(store.busy()).toBe(true);
    await settle();

    expect(diary.draft).toHaveBeenCalledWith(NOTE, store.capturedAt());
    expect(store.phase()).toBe(LogPhase.DRAFTED);
    expect(store.categories()).toEqual([supplement]);
    expect(store.edits()).toEqual({
      events: [
        {
          text: 'Took 5 g creatine',
          occurredAt: '2026-11-11T08:30',
          endsAt: '',
          span: false,
          category: supplement.id,
          extractorVersion: VERSION,
        },
        {
          text: 'Put the dishwasher on',
          occurredAt: '2026-11-11T08:31',
          endsAt: '',
          span: false,
          category: 'new:0',
          extractorVersion: VERSION,
        },
      ],
      newCategories: [{ key: 'new:0', name: 'chores', description: 'Housework' }],
    });
  });

  it('confirms the edited draft, then shows its day and resets', async () => {
    const { store, diary, timeline } = setup();
    store.submit(NOTE);
    await settle();

    store.edits.update((edits) => ({
      ...edits,
      events: edits.events.map((event, i) =>
        i === 1 ? { ...event, text: 'Dishwasher on', occurredAt: '2026-11-10T22:15' } : event,
      ),
      newCategories: edits.newCategories.map((c) => ({ ...c, name: ' housework ' })),
    }));
    const capturedAt = store.capturedAt();
    expect(await store.save()).toBe(true);

    expect(diary.createNote).toHaveBeenCalledWith({
      rawText: NOTE,
      capturedAt,
      events: [
        {
          text: 'Took 5 g creatine',
          occurredAt: '2026-11-11T07:30:00Z',
          endsAt: null,
          categoryId: supplement.id,
          extractorVersion: VERSION,
        },
        {
          text: 'Dishwasher on',
          occurredAt: '2026-11-10T21:15:00Z',
          endsAt: null,
          categoryId: null,
          newCategory: 'housework',
          extractorVersion: VERSION,
        },
      ],
      newCategories: [{ name: 'housework', description: 'Housework' }],
    });
    expect(timeline.jumpToDay).toHaveBeenCalledWith(Temporal.PlainDate.from('2026-11-11'));
    expect(store.phase()).toBe(LogPhase.IDLE);
    expect(store.edits().events).toEqual([]);
  });

  it('drops a proposed category once no event is in it', async () => {
    const { store, diary } = setup();
    store.submit(NOTE);
    await settle();

    store.edits.update((edits) => withoutEvent(edits, 1));
    expect(store.edits().newCategories).toEqual([]);
    await store.save();

    const note = diary.createNote.mock.calls[0][0];
    expect(note.events.map((e) => e.text)).toEqual(['Took 5 g creatine']);
    expect(note.newCategories).toEqual([]);
  });

  it('leaves events without a category when their proposed one is removed', async () => {
    const { store, diary } = setup();
    store.submit(NOTE);
    await settle();

    store.edits.update((edits) => withoutCategory(edits, 'new:0'));
    await store.save();

    const note = diary.createNote.mock.calls[0][0];
    expect(note.events[1]).toEqual(expect.objectContaining({ categoryId: null }));
    expect(note.events[1].newCategory).toBeUndefined();
    expect(note.newCategories).toEqual([]);
  });

  it('confirms on Enter only while the note is unchanged since the draft', async () => {
    const { store } = setup();
    expect(store.confirms(NOTE)).toBe(false);

    store.submit(NOTE);
    await settle();

    expect(store.confirms(NOTE)).toBe(true);
    expect(store.confirms(`${NOTE} at 7`)).toBe(false);
  });

  it("shows the API's message and keeps the note when the draft fails", async () => {
    const { store } = setup({
      draft: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 503,
              error: { message: "Couldn't reach the assistant. Try again later." },
            }),
        ),
    });

    store.submit(NOTE);
    await settle();

    expect(store.phase()).toBe(LogPhase.ERROR);
    expect(store.error()).toBe("Couldn't reach the assistant. Try again later.");
    expect(store.asked()).toBe(NOTE);
    expect(store.confirmable()).toBe(false);
  });

  it('shows why nothing was drafted and has nothing to confirm', async () => {
    const { store, diary } = setup({
      draft: () => of({ kind: 'nothing', text: "I didn't find anything to log in that." }),
    });

    store.submit('hmm');
    await settle();

    expect(store.phase()).toBe(LogPhase.DRAFTED);
    expect(store.confirmable()).toBe(false);
    expect(await store.save()).toBe(false);
    expect(diary.createNote).not.toHaveBeenCalled();
  });

  it('keeps the draft and its edits when the save fails', async () => {
    const { store, timeline } = setup({
      createNote: async () => {
        throw new Error("Couldn't log that. Try again.");
      },
    });
    store.submit(NOTE);
    await settle();
    store.edits.update((edits) => withoutEvent(edits, 0));

    expect(await store.save()).toBe(false);

    expect(store.saveError()).toBe("Couldn't log that. Try again.");
    expect(store.saving()).toBe(false);
    expect(store.confirmable()).toBe(true);
    expect(store.edits().events.map((e) => e.text)).toEqual(['Put the dishwasher on']);
    expect(timeline.jumpToDay).not.toHaveBeenCalled();
  });

  it('drops the in-flight draft when stopped', () => {
    const pending = new Subject<DiaryDraftResponse>();
    const { store } = setup({ draft: () => pending.asObservable() });

    store.submit(NOTE);
    store.stop();

    expect(store.phase()).toBe(LogPhase.IDLE);
    expect(pending.observed).toBe(false);
  });

  it('ignores a new note while a save is in flight', async () => {
    let finish!: (events: DiaryEvent[]) => void;
    const { store, diary } = setup({
      createNote: () => new Promise((resolve) => (finish = resolve)),
    });
    store.submit(NOTE);
    await settle();

    const saving = store.save();
    store.submit('another note');
    expect(diary.draft).toHaveBeenCalledTimes(1);

    finish(saved(diary.createNote.mock.calls[0][0]));
    expect(await saving).toBe(true);
  });
});
