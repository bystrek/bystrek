import { describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { diaryCategories, diaryEvents, healthImports } from '../../src/db/schema';
import { DiaryEventSource } from '../../src/diary/diary-event-source';
import { healthAutoExportSample } from '../fixtures/health-auto-export.sample';
import { createApp } from './support/app';
import { signUpTestUser } from './support/auth';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

// The app, plus a user with a personal API token the way the settings page creates one.
async function setUp(tx: Tx) {
  const { user, token: session } = await signUpTestUser(tx, {
    email: 'me@example.com',
    name: 'Me',
  });
  const app = await createApp(tx);
  const http = () => request(app.getHttpServer());
  const { key } = (
    await http()
      .post('/api/auth/api-key/create')
      .set({ Authorization: `Bearer ${session}` })
      .send({ name: 'Health Auto Export' })
  ).body as { key: string };
  const push = (body: object, token = key) =>
    http()
      .post('/health/import')
      .set({ Authorization: `Bearer ${token}` })
      .send(body);
  const events = () =>
    tx
      .select()
      .from(diaryEvents)
      .where(eq(diaryEvents.userId, user.id))
      .orderBy(asc(diaryEvents.occurredAt), asc(diaryEvents.externalId));
  return { app, user, session, push, events };
}

describe('POST /health/import (integration)', () => {
  it('stores the push as received and upserts its events, so a re-sent push adds none', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, user, push, events } = await setUp(tx);

      const first = await push(healthAutoExportSample);
      expect(first.status).toBe(201);
      expect(first.body).toEqual({ importId: expect.any(String), events: 5, skipped: 0 });

      const stored = await events();
      expect(stored.map((event) => [event.text, event.source, event.noteId])).toEqual([
        ['Sleep, 7 h 12 min', DiaryEventSource.Health, null],
        ['Weight 72.4 kg', DiaryEventSource.Health, null],
        ['Creatine, 5 g', DiaryEventSource.Health, null],
        ['Traditional Strength Training, 313 kcal', DiaryEventSource.Health, null],
        ['Weight 72.1 kg', DiaryEventSource.Health, null],
      ]);
      const categories = await tx
        .select({ id: diaryCategories.id, name: diaryCategories.name })
        .from(diaryCategories)
        .where(eq(diaryCategories.userId, user.id))
        .orderBy(asc(diaryCategories.name));
      expect(categories.map((category) => category.name)).toEqual([
        'Medication',
        'Sleep',
        'Weight',
        'Workout',
      ]);

      // The user moves the workout to a category of their own; a re-sent push keeps it.
      const workout = stored.find((event) => event.externalId?.startsWith('workout:'))!;
      const [gym] = await tx
        .insert(diaryCategories)
        .values({ userId: user.id, name: 'Gym' })
        .returning();
      await tx
        .update(diaryEvents)
        .set({ categoryId: gym.id })
        .where(eq(diaryEvents.id, workout.id));

      const again = await push(healthAutoExportSample);
      expect(again.status).toBe(201);
      expect(again.body).toEqual({ importId: expect.any(String), events: 5, skipped: 0 });

      const after = await events();
      expect(after.map((event) => event.id)).toEqual(stored.map((event) => event.id));
      expect(after.find((event) => event.id === workout.id)!.categoryId).toBe(gym.id);

      const raw = await tx
        .select({ payload: healthImports.payload })
        .from(healthImports)
        .where(eq(healthImports.userId, user.id));
      expect(raw.map((row) => row.payload)).toEqual([
        healthAutoExportSample,
        healthAutoExportSample,
      ]);

      await app.close();
    });
  });

  it('updates an event whose values changed and leaves types without a mapper raw-only', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, push, events } = await setUp(tx);
      const weighIn = (qty: number) => ({
        data: {
          metrics: [
            {
              name: 'weight_body_mass',
              units: 'kg',
              data: [{ date: '2026-11-10 07:15:00 +0100', qty }],
            },
            {
              name: 'step_count',
              units: 'count',
              data: [{ date: '2026-11-10 00:00:00 +0100', qty: 1 }],
            },
          ],
        },
      });

      await push(weighIn(72));
      await push(weighIn(71.5));
      expect((await events()).map((event) => [event.text, event.quantity, event.unit])).toEqual([
        ['Weight 71.5 kg', 71.5, 'kg'],
      ]);

      await app.close();
    });
  });

  it('accepts a backfill larger than the default body limit', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, push } = await setUp(tx);
      const start = Date.UTC(2025, 0, 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const data = Array.from({ length: 3000 }, (_, i) => {
        const at = new Date(start + i * 3 * 60 * 60 * 1000);
        const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}:00:00 +0000`;
        return { date, qty: 70 + (i % 10) / 10, source: 'Withings' };
      });
      const body = { data: { metrics: [{ name: 'weight_body_mass', units: 'kg', data }] } };
      expect(JSON.stringify(body).length).toBeGreaterThan(100 * 1024);

      const response = await push(body);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ events: 3000, skipped: 0 });

      await app.close();
    });
  });

  it('accepts only a personal API token, and only a push-shaped body', async () => {
    await withRollback(testDb, async (tx) => {
      const { app, session, push, events } = await setUp(tx);

      expect((await push(healthAutoExportSample, session)).status).toBe(401);
      expect((await push(healthAutoExportSample, 'bystrek_unknown')).status).toBe(401);
      // Over the limit: a bad token is turned away before the body is read, a good one isn't.
      const oversized = { data: { padding: 'x'.repeat(21 * 1024 * 1024) } };
      expect((await push(oversized, 'bystrek_unknown')).status).toBe(401);
      expect((await push(oversized)).status).toBe(413);
      expect((await push({ metrics: [] })).status).toBe(400);
      expect((await push({ data: { workouts: 'none' } })).status).toBe(400);
      expect(await events()).toEqual([]);

      await app.close();
    });
  });
});
