import { describe, expect, it } from 'bun:test';
import { DiaryEventPatchDto, DiaryEventRangeDto, NewDiaryNoteDto } from './diary.dto';

const CATEGORY_ID = '0b9a1e1c-5b7e-4a39-9c1a-3d6f0e2b8c11';

const note = (overrides: object = {}) => ({
  rawText: '  took 5g creatine and put the dishwasher on ',
  capturedAt: '2026-11-11T08:30:00+01:00',
  events: [
    {
      text: 'Took 5 g of creatine',
      occurredAt: '2026-11-11T08:00:00+01:00',
      newCategory: 'supplement',
    },
    {
      text: 'Put the dishwasher on',
      occurredAt: '2026-11-11T08:25:00+01:00',
      categoryId: CATEGORY_ID,
    },
  ],
  newCategories: [{ name: 'supplement', description: 'Supplements I take' }],
  ...overrides,
});

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('NewDiaryNoteDto', () => {
  const parse = (input: object) => NewDiaryNoteDto.schema.safeParse(input);

  it('accepts a note and turns instants into dates', () => {
    const result = parse(note());

    expect(result.success).toBe(true);
    expect(result.data!.rawText).toBe('took 5g creatine and put the dishwasher on');
    expect(result.data!.capturedAt).toEqual(new Date('2026-11-11T07:30:00Z'));
    expect(result.data!.events[0].occurredAt).toEqual(new Date('2026-11-11T07:00:00Z'));
  });

  it('defaults newCategories to none', () => {
    const result = parse(note({ newCategories: undefined, events: [note().events[1]] }));

    expect(result.data!.newCategories).toEqual([]);
  });

  it('rejects an instant without an offset', () => {
    expect(issues(parse(note({ capturedAt: '2026-11-11T08:30:00' })))).toEqual(['capturedAt']);
  });

  it('rejects a note with no events', () => {
    expect(issues(parse(note({ events: [], newCategories: [] })))).toEqual(['events']);
  });

  it('rejects blank text', () => {
    const events = [{ ...note().events[1], text: '   ' }];
    expect(issues(parse(note({ events, newCategories: [] })))).toEqual(['events.0.text']);
  });

  it('rejects a span that ends before it starts', () => {
    const events = [{ ...note().events[1], endsAt: '2026-11-11T08:00:00+01:00' }];
    expect(issues(parse(note({ events, newCategories: [] })))).toEqual(['events.0.endsAt']);
  });

  it('accepts a span', () => {
    const events = [{ ...note().events[1], endsAt: '2026-11-11T09:30:00+01:00' }];
    expect(parse(note({ events, newCategories: [] })).success).toBe(true);
  });

  it('rejects an event with both an existing and a new category', () => {
    const events = [{ ...note().events[0], categoryId: CATEGORY_ID }];
    expect(issues(parse(note({ events })))).toEqual(['events.0.newCategory']);
  });

  it('rejects a category id that is not a uuid', () => {
    const events = [{ ...note().events[1], categoryId: 'supplement' }];
    expect(issues(parse(note({ events, newCategories: [] })))).toEqual(['events.0.categoryId']);
  });

  it('rejects an event in a new category that is not listed', () => {
    expect(issues(parse(note({ newCategories: [] })))).toEqual(['events.0.newCategory']);
  });

  it('rejects a new category no event is in', () => {
    const newCategories = [...note().newCategories, { name: 'chores' }];
    expect(issues(parse(note({ newCategories })))).toEqual(['newCategories.1.name']);
  });

  it('rejects a new category listed twice', () => {
    const newCategories = [{ name: 'supplement' }, { name: ' supplement ' }];
    expect(issues(parse(note({ newCategories })))).toEqual(['newCategories.1.name']);
  });
});

describe('DiaryEventPatchDto', () => {
  const parse = (input: object) => DiaryEventPatchDto.schema.safeParse(input);

  it('accepts clearing the end and the category', () => {
    expect(parse({ endsAt: null, categoryId: null }).data).toEqual({
      endsAt: null,
      categoryId: null,
    });
  });

  it('drops fields the user may not edit', () => {
    expect(parse({ source: 'health', noteId: CATEGORY_ID, text: 'Pasta' }).data).toEqual({
      text: 'Pasta',
    });
  });
});

describe('DiaryEventRangeDto', () => {
  const parse = (input: object) => DiaryEventRangeDto.schema.safeParse(input);

  it('accepts a range', () => {
    expect(
      parse({ from: '2026-11-11T00:00:00+01:00', to: '2026-11-12T00:00:00+01:00' }).success,
    ).toBe(true);
  });

  it('rejects a missing bound', () => {
    expect(issues(parse({ from: '2026-11-11T00:00:00+01:00' }))).toEqual(['to']);
  });

  it('rejects an empty range', () => {
    const at = '2026-11-11T00:00:00+01:00';
    expect(issues(parse({ from: at, to: at }))).toEqual(['to']);
  });
});
