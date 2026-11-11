import { describe, expect, it, mock } from 'bun:test';
import { LLM_MODEL } from '../env';
import { LlmError, type LlmClient, type LlmJsonRequest } from '../llm/llm.client';
import type { UsersService } from '../users/users.service';
import type { DiaryCategoriesService, DiaryCategory } from './diary-categories.service';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './diary-draft.prompt';
import { DiaryDraftService, FALLBACK_TEXT, NOTHING_TEXT } from './diary-draft.service';

const SUPPLEMENT: DiaryCategory = {
  id: 'cat-supplement',
  name: 'supplement',
  description: 'Supplements I take',
  parentId: null,
};
const CHORES: DiaryCategory = {
  id: 'cat-chores',
  name: 'chores',
  description: null,
  parentId: null,
};

// Tuesday 2026-11-10 08:30 in Warsaw.
const CAPTURED_AT = new Date('2026-11-10T07:30:00Z');

const event = (fields: object = {}) => ({
  text: 'Took 5 g of creatine.',
  occurredAt: '2026-11-10T08:00',
  endsAt: null,
  category: 'supplement',
  description: null,
  ...fields,
});
const reply = (...events: object[]) => JSON.stringify({ events });

function setUp(content: string | Error, categories = [SUPPLEMENT, CHORES]) {
  const generateJson = mock((_: LlmJsonRequest) =>
    content instanceof Error ? Promise.reject(content) : Promise.resolve(content),
  );
  const users = { timeZone: mock(() => Promise.resolve('Europe/Warsaw')) };
  const list = mock(() => Promise.resolve(categories));
  const service = new DiaryDraftService(
    { generateJson } as LlmClient,
    users as unknown as UsersService,
    { list } as unknown as DiaryCategoriesService,
  );
  return {
    draft: (text = 'a note') => service.draft('u1', text, CAPTURED_AT),
    generateJson,
  };
}

describe('DiaryDraftService', () => {
  it('splits a note into events, each tagged with the prompt and model', async () => {
    const { draft } = setUp(
      reply(
        event({ text: 'Did the laundry.', category: 'chores' }),
        event({ text: 'Took 5 g of creatine.' }),
      ),
    );

    const response = await draft('did laundry and took 5g creatine');

    expect(response).toMatchObject({
      kind: 'draft',
      events: [
        { text: 'Did the laundry.', categoryId: CHORES.id },
        { text: 'Took 5 g of creatine.', categoryId: SUPPLEMENT.id },
      ],
      newCategories: [],
    });
    const versions =
      response.kind === 'draft' ? response.events.map((e) => e.extractorVersion) : [];
    expect(versions).toEqual([`${PROMPT_VERSION}/${LLM_MODEL}`, `${PROMPT_VERSION}/${LLM_MODEL}`]);
  });

  it("resolves wall-clock times in the user's zone", async () => {
    const { draft } = setUp(
      reply(event({ occurredAt: '2026-11-09T23:00', endsAt: '2026-11-10T07:00' })),
    );

    expect(await draft()).toMatchObject({
      events: [
        {
          occurredAt: new Date('2026-11-09T22:00:00Z'),
          endsAt: new Date('2026-11-10T06:00:00Z'),
        },
      ],
    });
  });

  it('uses the capture time for a missing or unreadable time and drops a bad end', async () => {
    const { draft } = setUp(
      reply(
        event({ occurredAt: null }),
        event({ occurredAt: 'this morning', endsAt: '2026-11-10T07:00:00+01:00' }),
        event({ occurredAt: '2026-11-10T08:00', endsAt: '2026-11-10T07:00' }),
      ),
    );

    expect(await draft()).toMatchObject({
      events: [
        { occurredAt: CAPTURED_AT, endsAt: null },
        { occurredAt: CAPTURED_AT, endsAt: null },
        { occurredAt: new Date('2026-11-10T07:00:00Z'), endsAt: null },
      ],
    });
  });

  it('matches an existing category regardless of case', async () => {
    const { draft } = setUp(reply(event({ category: ' Supplement ' })));

    expect(await draft()).toMatchObject({
      events: [{ categoryId: SUPPLEMENT.id }],
      newCategories: [],
    });
  });

  it('proposes a new category once, with its first description', async () => {
    const { draft } = setUp(
      reply(
        event({ text: 'Slept badly.', category: 'sleep', description: 'How I slept' }),
        event({ text: 'Napped.', category: 'Sleep', description: 'Naps' }),
      ),
    );

    const response = await draft();

    expect(response).toMatchObject({
      events: [
        { categoryId: null, newCategory: 'sleep' },
        { categoryId: null, newCategory: 'sleep' },
      ],
      newCategories: [{ name: 'sleep', description: 'How I slept' }],
    });
  });

  it('leaves an event without a category, and drops a stray description', async () => {
    const { draft } = setUp(reply(event({ category: null, description: 'Unused' })));

    const response = await draft();

    expect(response).toMatchObject({ events: [{ categoryId: null }], newCategories: [] });
    expect(response.kind === 'draft' && 'newCategory' in response.events[0]).toBe(false);
  });

  it('treats a blank or overlong category as none', async () => {
    const { draft } = setUp(
      reply(event({ category: '  ' }), event({ category: 'x'.repeat(51) }), event({ category: 7 })),
    );

    expect(await draft()).toMatchObject({
      events: [{ categoryId: null }, { categoryId: null }, { categoryId: null }],
      newCategories: [],
    });
  });

  it('answers a note with nothing to log', async () => {
    expect(await setUp(reply()).draft()).toEqual({ kind: 'nothing', text: NOTHING_TEXT });
  });

  it('falls back to text on a malformed reply', async () => {
    for (const content of [
      'Took creatine at 8',
      '[]',
      '{"event":{"text":"Took creatine"}}',
      reply(event({ text: '  ' })),
      reply(event({ text: 42 })),
      reply(...Array.from({ length: 51 }, () => event())),
    ]) {
      expect(await setUp(content).draft()).toEqual({ kind: 'text', text: FALLBACK_TEXT });
    }
  });

  it('sends the static system prompt; the time, categories and note go in the user message', async () => {
    const { draft, generateJson } = setUp(reply(event()));

    await draft('took creatine');

    const [request] = generateJson.mock.calls[0];
    expect(request.system).toBe(SYSTEM_PROMPT);
    expect(request.user).toBe(
      [
        'Now: Tuesday 2026-11-10 08:30',
        'Categories:',
        '- supplement: Supplements I take',
        '- chores',
        'Note: took creatine',
      ].join('\n'),
    );
  });

  it('tells the model when the user has no categories yet', async () => {
    const { draft, generateJson } = setUp(reply(event()), []);

    await draft('took creatine');

    expect(generateJson.mock.calls[0][0].user).toContain('Categories:\n(none yet)\nNote:');
  });

  it('passes a model failure through for the filter to map', async () => {
    await expect(setUp(new LlmError('down')).draft()).rejects.toBeInstanceOf(LlmError);
  });
});
