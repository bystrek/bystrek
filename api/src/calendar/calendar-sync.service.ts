import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/drizzle.provider';
import { calendarObjects, calendarSyncState } from '../db/schema';
import {
  CaldavMovedError,
  CaldavTransport,
  CaldavUnavailableError,
  SyncTokenInvalidError,
  type CaldavTarget,
  type FetchedObject,
  type SyncChanges,
} from './caldav-transport';
import { lockCalendarCopy, type Db, type Tx } from './calendar-copy-lock';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarDiscovery } from './calendar-discovery';
import {
  CalendarEventNotFoundError,
  CalendarNotConfiguredError,
  CalendarNotReadyError,
  type CalendarSyncProgress,
} from './calendar.errors';
import { objectUid } from './ical-event';

// Objects per calendar-multiget, and per transaction during the first download.
const BATCH_SIZE = 50;

type SyncState = typeof calendarSyncState.$inferSelect;

export interface StoredObject {
  href: string;
  etag: string | null;
  uid: string | null;
  ics: string;
}

function progressOf(state: SyncState): CalendarSyncProgress {
  return {
    status: state.status,
    fetched: state.fetched,
    total: state.total,
    error: state.error,
  };
}

// The local copy of each user's calendar (raw ICS in `calendar_objects`). A read is answered
// from it only after one PROPFIND shows it matches the server; if the server can't be
// reached, the read fails rather than answer from an unchecked copy. The first download runs
// in the background in batches and resumes where it stopped. Writes go straight to CalDAV:
// they change the ctag, so the next read syncs them in.
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);
  // First downloads running in this process. Another replica may run the same one; the lock
  // makes them take turns, and each batch only fetches what is still missing.
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly credentials: CalendarCredentialsService,
    private readonly discovery: CalendarDiscovery,
    private readonly transport: CaldavTransport,
  ) {}

  // Polled by the UI during the first download. Also restarts a download that stopped,
  // for example with the process that ran it.
  async progress(userId: string): Promise<CalendarSyncProgress> {
    const state = await this.loadState(this.db, userId);
    if (state.status === 'pending' || state.status === 'syncing') void this.start(userId);
    return progressOf(state);
  }

  // Restarts a failed first download. Objects already downloaded are kept.
  async retry(userId: string): Promise<CalendarSyncProgress> {
    await this.loadState(this.db, userId);
    await this.db
      .update(calendarSyncState)
      .set({ status: 'pending', error: null })
      .where(and(eq(calendarSyncState.userId, userId), eq(calendarSyncState.status, 'error')));
    return this.progress(userId);
  }

  // Runs the first download unless this process already is. Resolves when it stops.
  start(userId: string): Promise<void> {
    let run = this.running.get(userId);
    if (!run) {
      run = this.runFullSync(userId)
        // Only reached when even recording the failure failed, e.g. with the database down.
        .catch((err: unknown) => this.logger.error(`calendar sync for user ${userId}`, err))
        .finally(() => this.running.delete(userId));
      this.running.set(userId, run);
    }
    return run;
  }

  // The read path: the user's objects (or the one with `uid`), once the copy matches the
  // server. Throws CalendarNotReadyError until the first download is done.
  async checkedObjects(userId: string, filter: { uid?: string } = {}): Promise<StoredObject[]> {
    type Result = { objects: StoredObject[] } | { notReady: CalendarSyncProgress };
    const result = await this.db.transaction(async (tx): Promise<Result> => {
      await lockCalendarCopy(tx, userId);
      const state = await this.loadState(tx, userId);
      if (state.status !== 'ready') return { notReady: progressOf(state) };
      try {
        await this.refresh(tx, state);
      } catch (err) {
        if (!(err instanceof SyncTokenInvalidError)) throw err;
        this.logger.warn(`sync token rejected for user ${userId}; downloading the calendar again`);
        return { notReady: progressOf(await this.wipe(tx, userId)) };
      }
      return { objects: await this.storedObjects(tx, userId, filter) };
    });
    if ('notReady' in result) {
      void this.start(userId);
      throw new CalendarNotReadyError(result.notReady);
    }
    return result.objects;
  }

  // Writes go straight to CalDAV without checking the copy first. They run under the lock,
  // so a credentials change can't pair one account's calendar URL with another's
  // credentials, and they rediscover a moved calendar like reads do.
  async write(userId: string, send: (target: CaldavTarget) => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockCalendarCopy(tx, userId);
      const target = await this.target(tx, await this.loadState(tx, userId));
      await this.withRediscovery(tx, userId, target, send);
    });
  }

  // A write that changes the local object with `uid`, sent with its etag so that a stale
  // copy fails instead of overwriting a change made elsewhere.
  async writeObject(
    userId: string,
    uid: string,
    send: (target: CaldavTarget, object: StoredObject) => Promise<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockCalendarCopy(tx, userId);
      const state = await this.loadState(tx, userId);
      const [object] = await this.storedObjects(tx, userId, { uid });
      if (!object) throw new CalendarEventNotFoundError(uid);
      const target = await this.target(tx, state);
      await this.withRediscovery(tx, userId, target, (t) => send(t, object));
    });
  }

  private async loadState(db: Db | Tx, userId: string): Promise<SyncState> {
    const [existing] = await db
      .select()
      .from(calendarSyncState)
      .where(eq(calendarSyncState.userId, userId));
    if (existing) return existing;
    // Credentials without a copy: just connected, changed, or saved before the copy existed.
    if (!(await this.credentials.getInternal(userId, db))) throw new CalendarNotConfiguredError();
    await db.insert(calendarSyncState).values({ userId }).onConflictDoNothing();
    const [created] = await db
      .select()
      .from(calendarSyncState)
      .where(eq(calendarSyncState.userId, userId));
    return created;
  }

  private async storedObjects(
    db: Db | Tx,
    userId: string,
    filter: { uid?: string },
  ): Promise<StoredObject[]> {
    const rows = await db
      .select({
        href: calendarObjects.href,
        etag: calendarObjects.etag,
        uid: calendarObjects.uid,
        ics: calendarObjects.ics,
      })
      .from(calendarObjects)
      .where(
        and(
          eq(calendarObjects.userId, userId),
          isNotNull(calendarObjects.ics),
          filter.uid === undefined ? undefined : eq(calendarObjects.uid, filter.uid),
        ),
      );
    return rows as StoredObject[];
  }

  private async target(db: Db | Tx, state: SyncState): Promise<CaldavTarget> {
    const creds = await this.credentials.getInternal(state.userId, db);
    if (!creds) throw new CalendarNotConfiguredError();
    let calendarUrl = state.calendarUrl;
    if (!calendarUrl) {
      calendarUrl = await this.discovery.resolveCalendarUrl(creds);
      await db
        .update(calendarSyncState)
        .set({ calendarUrl })
        .where(eq(calendarSyncState.userId, state.userId));
    }
    return { calendarUrl, username: creds.username, password: creds.password };
  }

  // Runs `request`, and once more after discovery when the server says the calendar moved
  // (for example to another iCloud partition host). Every CalDAV request goes through it.
  // The new URL is written into `target`, so later requests on it go there directly.
  private async withRediscovery<T>(
    tx: Tx,
    userId: string,
    target: CaldavTarget,
    request: (target: CaldavTarget) => Promise<T>,
  ): Promise<T> {
    try {
      return await request(target);
    } catch (err) {
      if (!(err instanceof CaldavMovedError)) throw err;
      const creds = await this.credentials.getInternal(userId, tx);
      if (!creds) throw new CalendarNotConfiguredError();
      target.calendarUrl = await this.discovery.resolveCalendarUrl(creds);
      await tx
        .update(calendarSyncState)
        .set({ calendarUrl: target.calendarUrl })
        .where(eq(calendarSyncState.userId, userId));
      try {
        return await request(target);
      } catch (retryErr) {
        if (retryErr instanceof CaldavMovedError) {
          throw new CaldavUnavailableError(retryErr.message);
        }
        throw retryErr;
      }
    }
  }

  // One PROPFIND; a sync-collection report only when the tag changed.
  private async refresh(tx: Tx, state: SyncState): Promise<void> {
    const target = await this.target(tx, state);
    const tag = await this.withRediscovery(tx, state.userId, target, (t) =>
      this.transport.fetchTag(t),
    );
    if (tag !== null && tag === state.ctag) return;

    const changes = await this.withRediscovery(tx, state.userId, target, (t) =>
      this.transport.syncChanges(t, state.syncToken ?? ''),
    );
    await this.applyChanges(tx, state.userId, target, changes);
    // The tag is from before the report, so a change that landed in between only costs
    // one more report on the next read.
    await tx
      .update(calendarSyncState)
      .set({ syncToken: changes.token ?? state.syncToken, ctag: tag })
      .where(eq(calendarSyncState.userId, state.userId));
  }

  private async applyChanges(
    tx: Tx,
    userId: string,
    target: CaldavTarget,
    changes: SyncChanges,
  ): Promise<void> {
    const deleted = [...changes.deleted];
    for (let i = 0; i < changes.changed.length; i += BATCH_SIZE) {
      const hrefs = changes.changed.slice(i, i + BATCH_SIZE).map((change) => change.href);
      const fetched = await this.withRediscovery(tx, userId, target, (t) =>
        this.transport.fetchObjects(t, hrefs),
      );
      await this.storeObjects(tx, userId, fetched);
      const found = new Set(fetched.map((object) => object.href));
      deleted.push(...hrefs.filter((href) => !found.has(href)));
    }
    await this.deleteObjects(tx, userId, deleted);
  }

  private async storeObjects(tx: Tx, userId: string, objects: FetchedObject[]): Promise<void> {
    if (objects.length === 0) return;
    await tx
      .insert(calendarObjects)
      .values(objects.map((object) => ({ userId, ...object, uid: objectUid(object.ics) })))
      .onConflictDoUpdate({
        target: [calendarObjects.userId, calendarObjects.href],
        set: {
          etag: sql`excluded.etag`,
          uid: sql`excluded.uid`,
          ics: sql`excluded.ics`,
        },
      });
  }

  private async deleteObjects(tx: Tx, userId: string, hrefs: string[]): Promise<void> {
    if (hrefs.length === 0) return;
    await tx
      .delete(calendarObjects)
      .where(and(eq(calendarObjects.userId, userId), inArray(calendarObjects.href, hrefs)));
  }

  // Drops the copy and queues a fresh first download. The calendar URL stays cached.
  private async wipe(tx: Tx, userId: string): Promise<SyncState> {
    await tx.delete(calendarObjects).where(eq(calendarObjects.userId, userId));
    const [state] = await tx
      .update(calendarSyncState)
      .set({
        status: 'pending',
        syncToken: null,
        pendingSyncToken: null,
        ctag: null,
        fetched: 0,
        total: null,
        error: null,
      })
      .where(eq(calendarSyncState.userId, userId))
      .returning();
    return state;
  }

  private async runFullSync(userId: string): Promise<void> {
    try {
      while (!(await this.db.transaction((tx) => this.fullSyncStep(tx, userId)))) {
        // Each step commits, so progress is visible and a restart resumes from here.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`calendar sync failed for user ${userId}: ${message}`);
      await this.db
        .update(calendarSyncState)
        .set({ status: 'error', error: message })
        .where(eq(calendarSyncState.userId, userId));
    }
  }

  // One step of the first download, under the lock: list every object, or fetch the next
  // batch, or finish. Returns true when there is nothing left to do. The state is read
  // again each step, so a credentials change mid-download (which deletes it) stops it.
  private async fullSyncStep(tx: Tx, userId: string): Promise<boolean> {
    await lockCalendarCopy(tx, userId);
    const [state] = await tx
      .select()
      .from(calendarSyncState)
      .where(eq(calendarSyncState.userId, userId));
    if (!state || state.status === 'ready' || state.status === 'error') return true;
    const target = await this.target(tx, state);

    if (state.pendingSyncToken === null) {
      const listing = await this.withRediscovery(tx, userId, target, (t) =>
        this.transport.syncChanges(t, ''),
      );
      // Only a token the server returned is ever stored: SabreDAV accepts made-up ones.
      if (!listing.token) throw new CaldavUnavailableError('the server returned no sync token');
      await tx.delete(calendarObjects).where(eq(calendarObjects.userId, userId));
      if (listing.changed.length > 0) {
        await tx
          .insert(calendarObjects)
          .values(listing.changed.map(({ href, etag }) => ({ userId, href, etag })))
          .onConflictDoNothing();
      }
      await tx
        .update(calendarSyncState)
        .set({
          status: 'syncing',
          pendingSyncToken: listing.token,
          fetched: 0,
          total: listing.changed.length,
          error: null,
        })
        .where(eq(calendarSyncState.userId, userId));
      return false;
    }

    const missing = await tx
      .select({ href: calendarObjects.href })
      .from(calendarObjects)
      .where(and(eq(calendarObjects.userId, userId), isNull(calendarObjects.ics)))
      .limit(BATCH_SIZE);
    if (missing.length === 0) {
      // A null ctag makes the first read run one report from the listing's token, which
      // picks up anything that changed while the download ran.
      await tx
        .update(calendarSyncState)
        .set({
          status: 'ready',
          syncToken: state.pendingSyncToken,
          pendingSyncToken: null,
          ctag: null,
        })
        .where(eq(calendarSyncState.userId, userId));
      return true;
    }

    const hrefs = missing.map((row) => row.href);
    const fetched = await this.withRediscovery(tx, userId, target, (t) =>
      this.transport.fetchObjects(t, hrefs),
    );
    await this.storeObjects(tx, userId, fetched);
    const found = new Set(fetched.map((object) => object.href));
    await this.deleteObjects(
      tx,
      userId,
      hrefs.filter((href) => !found.has(href)),
    );
    const [counts] = await tx
      .select({ total: count(), fetched: count(calendarObjects.ics) })
      .from(calendarObjects)
      .where(eq(calendarObjects.userId, userId));
    await tx
      .update(calendarSyncState)
      .set({ status: 'syncing', fetched: counts.fetched, total: counts.total })
      .where(eq(calendarSyncState.userId, userId));
    return false;
  }
}
