import { describe, expect, it, mock } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CALDAV_FETCH } from '../../src/calendar/caldav-transport';
import { CalendarDiscovery } from '../../src/calendar/calendar-discovery';
import { CalendarSyncService } from '../../src/calendar/calendar-sync.service';
import { CalendarService } from '../../src/calendar/calendar.service';
import { encryptField } from '../../src/crypto/field-encryption';
import { DRIZZLE } from '../../src/db/drizzle.provider';
import type { Db } from '../../src/calendar/calendar-copy-lock';
import { calendarCredentials, calendarSyncState, users } from '../../src/db/schema';
import { signUpTestUser } from './support/auth';
import { eventIcs, FakeCaldav } from './support/fake-caldav';
import { withRollback } from './support/rollback';
import { testDb } from './support/test-db';

const SEPTEMBER_1 = '/calendar/events?start=2026-09-01T00:00:00&end=2026-09-02T00:00:00';

async function setUp(db: Db, email = 'me@example.com') {
  const server = new FakeCaldav();
  const { token, user } = await signUpTestUser(db, { email, name: 'Me' });
  await db.update(users).set({ timezone: 'UTC' }).where(eq(users.id, user.id));
  await db.insert(calendarCredentials).values({
    userId: user.id,
    caldavUrl: 'https://caldav.example.com',
    username: 'me',
    password: encryptField('app-password'),
    calendarUrl: server.calendarUrl,
  });
  // Discovery is the tsdav client's job and isn't under test: it returns wherever the
  // fake calendar currently lives.
  const resolveCalendarUrl = mock((): Promise<string> => Promise.resolve(server.calendarUrl));

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    .overrideProvider(CALDAV_FETCH)
    .useValue(server.fetch)
    .overrideProvider(CalendarDiscovery)
    .useValue({ resolveCalendarUrl })
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  const sync = app.get(CalendarSyncService);
  const http = () => request(app.getHttpServer());
  const auth = { Authorization: `Bearer ${token}` };

  return {
    app,
    server,
    sync,
    userId: user.id,
    resolveCalendarUrl,
    get: (path: string) => http().get(path).set(auth),
    post: (path: string) => http().post(path).set(auth),
    put: (path: string, body: object) => http().put(path).set(auth).send(body),
    // The first download, as the UI's first poll starts it.
    async download() {
      await http().get('/calendar/sync').set(auth);
      await sync.start(user.id);
    },
  };
}

function summaries(res: request.Response): string[] {
  return (res.body as { events: { summary: string }[] }).events.map((e) => e.summary).sort();
}

describe('calendar sync (integration)', () => {
  it('downloads the calendar in batches, reports progress, then answers reads', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      for (let i = 0; i < 120; i++) t.server.put(`e${i}.ics`, eventIcs(`uid-${i}`, `Event ${i}`));

      const before = await t.get(SEPTEMBER_1);
      expect(before.status).toBe(409);
      expect((before.body as { message: string }).message).toContain('still syncing');

      expect((await t.get('/calendar/sync')).body).toMatchObject({ status: 'pending' });
      await t.sync.start(t.userId);
      expect((await t.get('/calendar/sync')).body).toEqual({
        status: 'ready',
        fetched: 120,
        total: 120,
        error: null,
      });
      expect(t.server.count('calendar-multiget')).toBe(3);

      const res = await t.get(SEPTEMBER_1);
      expect(res.status).toBe(200);
      expect(summaries(res)).toHaveLength(120);

      await t.app.close();
    });
  });

  it('makes exactly one CalDAV request for a read when nothing changed', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      // The first read after the download runs one report from the listing's token.
      expect((await t.get(SEPTEMBER_1)).status).toBe(200);

      t.server.requests.length = 0;
      const res = await t.get(SEPTEMBER_1);
      expect(res.status).toBe(200);
      expect(summaries(res)).toEqual(['Standup']);
      expect(t.server.requests.map((r) => r.method)).toEqual(['PROPFIND']);

      t.server.requests.length = 0;
      expect((await t.get('/calendar/events/a')).status).toBe(200);
      expect(t.server.requests).toHaveLength(1);

      await t.app.close();
    });
  });

  it('shows an edit, an addition and a deletion from another client on the very next read', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      t.server.put('b.ics', eventIcs('b', 'Lunch'));
      await t.download();
      expect(summaries(await t.get(SEPTEMBER_1))).toEqual(['Lunch', 'Standup']);

      t.server.put('a.ics', eventIcs('a', 'Standup (moved room)'));
      t.server.remove('b.ics');
      t.server.put('c.ics', eventIcs('c', 'Dentist'));
      expect(summaries(await t.get(SEPTEMBER_1))).toEqual(['Dentist', 'Standup (moved room)']);
      expect((await t.get('/calendar/events/b')).status).toBe(404);

      await t.app.close();
    });
  });

  it('downloads everything again when the server rejects the sync token', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      expect((await t.get(SEPTEMBER_1)).status).toBe(200);

      t.server.rejectTokens = true;
      t.server.put('b.ics', eventIcs('b', 'Lunch'));
      const res = await t.get(SEPTEMBER_1);
      expect(res.status).toBe(409);
      expect((await t.get('/calendar/sync')).body).toMatchObject({ status: 'pending' });

      t.server.rejectTokens = false;
      await t.sync.start(t.userId);
      expect(summaries(await t.get(SEPTEMBER_1))).toEqual(['Lunch', 'Standup']);

      await t.app.close();
    });
  });

  it('fails the read instead of answering from the copy when the server is unreachable', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      expect((await t.get(SEPTEMBER_1)).status).toBe(200);

      t.server.unreachable = true;
      expect((await t.get(SEPTEMBER_1)).status).toBe(503);
      expect((await t.get('/calendar/events/a')).status).toBe(503);

      await t.app.close();
    });
  });

  it('resumes a failed first download where it stopped', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      for (let i = 0; i < 120; i++) t.server.put(`e${i}.ics`, eventIcs(`uid-${i}`, `Event ${i}`));
      t.server.multigetsBeforeFailure = 1;

      await t.download();
      expect((await t.get('/calendar/sync')).body).toMatchObject({
        status: 'error',
        fetched: 50,
        total: 120,
      });
      expect((await t.get(SEPTEMBER_1)).status).toBe(409);

      t.server.multigetsBeforeFailure = null;
      t.server.requests.length = 0;
      expect((await t.post('/calendar/sync')).status).toBe(201);
      await t.sync.start(t.userId);
      expect((await t.get('/calendar/sync')).body).toMatchObject({ status: 'ready', fetched: 120 });
      // Only the 70 objects still missing were fetched, and the listing didn't run again.
      const fetchedHrefs = t.server.requests
        .filter((r) => r.body.includes('calendar-multiget'))
        .flatMap((r) => [...r.body.matchAll(/<d:href>/g)]);
      expect(fetchedHrefs).toHaveLength(70);
      expect(t.server.count('sync-collection')).toBe(0);

      await t.app.close();
    });
  });

  it('runs discovery again when the calendar moves to another host', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      expect((await t.get(SEPTEMBER_1)).status).toBe(200);
      t.resolveCalendarUrl.mockClear();

      t.server.moveTo('https://p42-caldav.example.com/123/calendars/home/');
      t.server.put('b.ics', eventIcs('b', 'Lunch'));
      expect(summaries(await t.get(SEPTEMBER_1))).toEqual(['Lunch', 'Standup']);
      expect(t.resolveCalendarUrl).toHaveBeenCalledTimes(1);
      const [state] = await tx
        .select({ calendarUrl: calendarSyncState.calendarUrl })
        .from(calendarSyncState)
        .where(eq(calendarSyncState.userId, t.userId));
      expect(state.calendarUrl).toBe(t.server.calendarUrl);

      await t.app.close();
    });
  });

  it('wipes the copy for another calendar, but keeps it for a new password', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      const credentials = {
        caldavUrl: 'https://caldav.example.com',
        username: 'me',
        calendarUrl: t.server.calendarUrl,
      };

      expect(
        (await t.put('/calendar/credentials', { ...credentials, password: 'new' })).status,
      ).toBe(200);
      expect((await t.get('/calendar/sync')).body).toMatchObject({ status: 'ready' });

      const other = {
        ...credentials,
        calendarUrl: `${t.server.calendarUrl}../work/`,
        password: '',
      };
      expect((await t.put('/calendar/credentials', other)).status).toBe(200);
      expect((await t.get('/calendar/sync')).body).toMatchObject({ status: 'pending', fetched: 0 });
      await t.sync.start(t.userId);

      await t.app.close();
    });
  });

  it('sends writes straight to the server and picks them up on the next read', async () => {
    await withRollback(testDb, async (tx) => {
      const t = await setUp(tx);
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      const calendar = t.app.get(CalendarService);

      await calendar.updateEvent(t.userId, 'a', { summary: 'Retro' });
      expect(summaries(await t.get(SEPTEMBER_1))).toEqual(['Retro']);

      // Changed from another client since our read: the stored etag is stale.
      t.server.put('a.ics', eventIcs('a', 'Changed elsewhere'));
      await expect(calendar.deleteEvent(t.userId, 'a')).rejects.toThrow('changed in another app');

      await t.app.close();
    });
  });
});

// Real connections, not one rollback transaction: inside a single transaction the lock
// is re-entrant and could never make the second read wait.
describe('calendar sync with concurrent reads (integration)', () => {
  it('runs at most one sync for reads that arrive together', async () => {
    const email = `concurrent-${crypto.randomUUID()}@example.com`;
    const t = await setUp(testDb, email);
    try {
      t.server.put('a.ics', eventIcs('a', 'Standup'));
      await t.download();
      expect((await t.get(SEPTEMBER_1)).status).toBe(200);

      t.server.put('b.ics', eventIcs('b', 'Lunch'));
      t.server.requests.length = 0;
      t.server.delayMs = 50;
      const results = await Promise.all([
        t.get(SEPTEMBER_1),
        t.get(SEPTEMBER_1),
        t.get(SEPTEMBER_1),
      ]);

      for (const res of results) expect(summaries(res)).toEqual(['Lunch', 'Standup']);
      expect(t.server.count('sync-collection')).toBe(1);
      expect(t.server.count('PROPFIND')).toBe(3);
    } finally {
      await t.app.close();
      await testDb.delete(users).where(eq(users.email, email));
    }
  });
});
