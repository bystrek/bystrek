import { describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { type Db, DRIZZLE } from '../../src/db/drizzle.provider';
import { categories, events, notes } from '../../src/db/schema';
import { EventSource } from '../../src/log/event-source';
import type { Category } from '../../src/log/log-categories.service';
import type { LogEvent } from '../../src/log/log-events.service';
import type { Note } from '../../src/log/log-notes.service';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

async function setUp(db: Db) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();

  const as = async (email: string) => {
    const { user, token } = await signUpTestUser(db, { email, name: email.split('@')[0] });
    const auth = { Authorization: `Bearer ${token}` };
    const http = () => request(app.getHttpServer());
    return {
      user,
      get: (path: string, query: object = {}) => http().get(path).query(query).set(auth),
      post: (path: string, body: object) => http().post(path).set(auth).send(body),
      patch: (path: string, body: object) => http().patch(path).set(auth).send(body),
      delete: (path: string) => http().delete(path).set(auth),
    };
  };
  return { app, as };
}

const DAY = { from: '2026-11-11T00:00:00+01:00', to: '2026-11-12T00:00:00+01:00' };

const creatineNote = {
  rawText: 'took 5g creatine and put the dishwasher on',
  capturedAt: '2026-11-11T08:30:00+01:00',
  events: [
    {
      text: 'Took 5 g of creatine',
      occurredAt: '2026-11-11T08:00:00+01:00',
      newCategory: 'supplement',
      extractorVersion: 'log-draft@1',
    },
    { text: 'Put the dishwasher on', occurredAt: '2026-11-11T08:25:00+01:00' },
  ],
  newCategories: [{ name: 'supplement', description: 'Supplements I take' }],
};

// One event per note, so tests can set up the timeline they need.
const single = (text: string, occurredAt: string, endsAt?: string) => ({
  rawText: text,
  capturedAt: occurredAt,
  events: [{ text, occurredAt, endsAt }],
});

const texts = (res: request.Response) => (res.body as LogEvent[]).map((event) => event.text);

describe('/log (integration)', () => {
  it('401s without a session token', async () => {
    await withRollback(testDb, async (tx) => {
      const { app } = await setUp(tx);
      const http = () => request(app.getHttpServer());

      expect((await http().get('/log/events').query(DAY)).status).toBe(401);
      expect((await http().get('/log/categories')).status).toBe(401);
      expect((await http().post('/log/notes').send(creatineNote)).status).toBe(401);

      await app.close();
    });
  });

  it('saves a note with its new category and events, and lists them', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');

      const created = await me.post('/log/notes', creatineNote);

      expect(created.status).toBe(201);
      const note = created.body as Note;
      expect(note.rawText).toBe(creatineNote.rawText);
      expect(created.body).toMatchObject({ capturedAt: '2026-11-11T07:30:00.000Z' });
      const [supplement] = (await me.get('/log/categories')).body as Category[];
      expect(supplement).toMatchObject({ name: 'supplement', description: 'Supplements I take' });
      expect(note.events).toEqual([
        {
          id: expect.any(String) as string,
          noteId: note.id,
          text: 'Took 5 g of creatine',
          occurredAt: '2026-11-11T07:00:00.000Z',
          endsAt: null,
          source: EventSource.Manual,
          category: { id: supplement.id, name: 'supplement' },
        },
        expect.objectContaining({ text: 'Put the dishwasher on', category: null }),
      ]);
      const [stored] = await tx.select().from(events).where(eq(events.id, note.events[0].id));
      expect(stored.extractorVersion).toBe('log-draft@1');

      const listed = await me.get('/log/events', DAY);
      expect(listed.status).toBe(200);
      expect(listed.body).toEqual(note.events);

      await app.close();
    });
  });

  it('files events under an existing category', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      await me.post('/log/notes', creatineNote);
      const [supplement] = (await me.get('/log/categories')).body as Category[];

      const created = await me.post('/log/notes', {
        ...single('Took vitamin D', '2026-11-11T09:00:00+01:00'),
        events: [
          {
            text: 'Took vitamin D',
            occurredAt: '2026-11-11T09:00:00+01:00',
            categoryId: supplement.id,
          },
        ],
      });

      expect(created.status).toBe(201);
      expect((created.body as Note).events[0].category).toEqual({
        id: supplement.id,
        name: 'supplement',
      });

      await app.close();
    });
  });

  it('reuses a category the user already has when it is proposed again', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      await me.post('/log/notes', creatineNote);

      const again = await me.post('/log/notes', creatineNote);

      expect(again.status).toBe(201);
      const listed = (await me.get('/log/categories')).body as Category[];
      expect(listed).toHaveLength(1);
      expect((again.body as Note).events[0].category!.id).toBe(listed[0].id);

      await app.close();
    });
  });

  it("rejects another user's category and stores nothing from the note", async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const other = await as('other@example.com');
      await other.post('/log/notes', creatineNote);
      const [theirs] = (await other.get('/log/categories')).body as Category[];
      const me = await as('me@example.com');

      const res = await me.post('/log/notes', {
        ...creatineNote,
        events: [
          ...creatineNote.events,
          { text: 'Took zinc', occurredAt: '2026-11-11T08:05:00+01:00', categoryId: theirs.id },
        ],
      });

      expect(res.status).toBe(422);
      expect(await tx.select().from(notes).where(eq(notes.userId, me.user.id))).toEqual([]);
      expect(await tx.select().from(events).where(eq(events.userId, me.user.id))).toEqual([]);
      expect(await tx.select().from(categories).where(eq(categories.userId, me.user.id))).toEqual(
        [],
      );

      await app.close();
    });
  });

  it('400s on an invalid note', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');

      const res = await me.post('/log/notes', { ...creatineNote, newCategories: [] });

      expect(res.status).toBe(400);
      expect(await tx.select().from(notes).where(eq(notes.userId, me.user.id))).toEqual([]);

      await app.close();
    });
  });

  it('lists the events overlapping the range, oldest first', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      const log = (text: string, occurredAt: string, endsAt?: string) =>
        me.post('/log/notes', single(text, occurredAt, endsAt));
      await log('the day before', '2026-11-10T21:00:00+01:00');
      await log('evening that ends at midnight', '2026-11-10T22:00:00+01:00', DAY.from);
      await log('slept', '2026-11-10T23:40:00+01:00', '2026-11-11T07:10:00+01:00');
      await log('at midnight', DAY.from);
      await log('lunch', '2026-11-11T13:00:00+01:00');
      await log('the next day', DAY.to);
      await log('night shift', '2026-11-11T22:00:00+01:00', '2026-11-12T06:00:00+01:00');

      const listed = await me.get('/log/events', DAY);

      expect(texts(listed)).toEqual(['slept', 'at midnight', 'lunch', 'night shift']);
      expect((listed.body as { endsAt: string }[])[0].endsAt).toBe('2026-11-11T06:10:00.000Z');

      await app.close();
    });
  });

  it('400s on a missing or empty range', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');

      expect((await me.get('/log/events', { from: DAY.from })).status).toBe(400);
      expect((await me.get('/log/events', { from: DAY.to, to: DAY.from })).status).toBe(400);

      await app.close();
    });
  });

  it('edits an event', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      const note = (await me.post('/log/notes', creatineNote)).body as Note;
      const [creatine, dishwasher] = note.events;

      const moved = await me.patch(`/log/events/${dishwasher.id}`, {
        text: 'Ran the dishwasher',
        endsAt: '2026-11-11T10:00:00+01:00',
        categoryId: creatine.category!.id,
      });
      const uncategorized = await me.patch(`/log/events/${creatine.id}`, { categoryId: null });

      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({
        text: 'Ran the dishwasher',
        occurredAt: dishwasher.occurredAt,
        endsAt: '2026-11-11T09:00:00.000Z',
        category: creatine.category,
      });
      expect(uncategorized.body).toMatchObject({ text: creatine.text, category: null });
      expect(texts(await me.get('/log/events', DAY))).toEqual([
        'Took 5 g of creatine',
        'Ran the dishwasher',
      ]);

      await app.close();
    });
  });

  it('rejects an edit that ends the event before it starts', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      const note = (await me.post('/log/notes', creatineNote)).body as Note;
      const [creatine] = note.events;

      const res = await me.patch(`/log/events/${creatine.id}`, {
        endsAt: '2026-11-11T07:00:00+01:00',
      });

      expect(res.status).toBe(400);

      await app.close();
    });
  });

  it('deletes an event', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const me = await as('me@example.com');
      const note = (await me.post('/log/notes', creatineNote)).body as Note;

      expect((await me.delete(`/log/events/${note.events[0].id}`)).status).toBe(204);
      expect((await me.delete(`/log/events/${note.events[0].id}`)).status).toBe(404);
      expect(texts(await me.get('/log/events', DAY))).toEqual(['Put the dishwasher on']);
      // The note stays as typed.
      expect(await tx.select().from(notes).where(eq(notes.id, note.id))).toHaveLength(1);

      await app.close();
    });
  });

  it("keeps each user's log private", async () => {
    await withRollback(testDb, async (tx) => {
      const { app, as } = await setUp(tx);
      const other = await as('other@example.com');
      const theirs = ((await other.post('/log/notes', creatineNote)).body as Note).events[0];
      const me = await as('me@example.com');
      const mine = (
        (await me.post('/log/notes', single('Had pasta', '2026-11-11T19:00:00+01:00'))).body as Note
      ).events[0];

      expect(texts(await me.get('/log/events', DAY))).toEqual(['Had pasta']);
      expect((await me.get('/log/categories')).body).toEqual([]);
      expect((await me.patch(`/log/events/${theirs.id}`, { text: 'mine now' })).status).toBe(404);
      expect((await me.delete(`/log/events/${theirs.id}`)).status).toBe(404);
      expect(
        (await me.patch(`/log/events/${mine.id}`, { categoryId: theirs.category!.id })).status,
      ).toBe(422);
      expect((await other.get('/log/events', DAY)).body).toContainEqual(theirs);

      await app.close();
    });
  });
});
