import { Inject, Injectable, type Provider } from '@nestjs/common';
import {
  calendarMultiGet,
  createObject,
  deleteObject,
  propfind,
  syncCollection,
  updateObject,
  type DAVResponse,
} from 'tsdav';

// The CalDAV requests the local calendar copy makes against an already discovered calendar
// URL. No tsdav DAVClient here: building one repeats discovery (6+ requests) every time.
// Every server reply is mapped to one of the errors below, once, so callers only decide
// what to do next.

export const CALDAV_FETCH = Symbol('CALDAV_FETCH');

const REQUEST_TIMEOUT_MS = 15_000;

// Redirects are not followed: a 301 means the calendar moved, which discovery resolves.
export const caldavFetchProvider: Provider = {
  provide: CALDAV_FETCH,
  useValue: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })) as typeof fetch,
};

// The calendar moved or the credentials stopped working (301, 404, 401): run discovery again.
export class CaldavMovedError extends Error {
  constructor(status: number) {
    super(`CalDAV server answered ${status}`);
  }
}

// RFC 6578 §3.2: the server no longer accepts the sync token, so the copy must be rebuilt.
export class SyncTokenInvalidError extends Error {
  constructor() {
    super('CalDAV server rejected the sync token');
  }
}

// An If-Match or If-None-Match write lost to a change made elsewhere.
export class CaldavPreconditionFailedError extends Error {
  constructor() {
    super('the event changed on the server');
  }
}

export class CaldavUnavailableError extends Error {
  constructor(detail: string) {
    super(`couldn't reach the CalDAV server: ${detail}`);
  }
}

export interface CaldavTarget {
  calendarUrl: string;
  username: string;
  password: string;
}

export interface SyncChanges {
  // Null when the server sent no new token; the caller keeps the one it has.
  token: string | null;
  changed: { href: string; etag: string | null }[];
  deleted: string[];
}

export interface FetchedObject {
  href: string;
  etag: string | null;
  ics: string;
}

function errorForStatus(status: number, body: string): Error {
  if ([301, 302, 307, 308, 401, 404].includes(status)) return new CaldavMovedError(status);
  if (status === 403 && /valid-sync-token/.test(body)) return new SyncTokenInvalidError();
  if (status === 412) return new CaldavPreconditionFailedError();
  return new CaldavUnavailableError(`HTTP ${status}`);
}

function rawText(response: DAVResponse | undefined): string {
  return typeof response?.raw === 'string' ? response.raw : '';
}

// tsdav returns the whole parsed body as `raw` on every item of a multistatus reply, and a
// single item with the reply's own status when the request itself failed. An empty
// multistatus comes back as one item with neither.
function multistatus(responses: DAVResponse[]): {
  items: DAVResponse[];
  root: Record<string, unknown>;
} {
  const first = responses[0];
  const root = (first?.raw as { multistatus?: Record<string, unknown> } | undefined)?.multistatus;
  if (root) return { items: responses, root };
  if (first?.ok && first.status === 207 && first.raw === undefined) return { items: [], root: {} };
  throw errorForStatus(first?.status ?? 0, rawText(first));
}

// tsdav turns numeric-looking text into numbers.
function text(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

// The copy stores paths, so the same object keeps its key when iCloud moves the calendar
// to another partition host.
function pathOf(href: string, base: string): string {
  return new URL(href, base).pathname;
}

@Injectable()
export class CaldavTransport {
  constructor(@Inject(CALDAV_FETCH) private readonly fetch: typeof globalThis.fetch) {}

  // One depth-0 PROPFIND: the collection's change tag. Servers without `getctag` still
  // return a sync-token, which changes on every edit as well.
  async fetchTag(target: CaldavTarget): Promise<string | null> {
    const responses = await this.send(() =>
      propfind({
        url: target.calendarUrl,
        props: { 'cs:getctag': {}, 'd:sync-token': {} },
        depth: '0',
        headers: this.headers(target),
        fetch: this.fetch,
      }),
    );
    const [item] = multistatus(responses).items;
    if (!item?.ok) throw errorForStatus(item?.status ?? 0, '');
    const props = item.props ?? {};
    return text(props.getctag) ?? text(props.syncToken);
  }

  // An empty token lists every object in the calendar.
  async syncChanges(target: CaldavTarget, token: string): Promise<SyncChanges> {
    const responses = await this.send(() =>
      syncCollection({
        url: target.calendarUrl,
        props: { 'd:getetag': {} },
        syncLevel: 1,
        syncToken: token,
        headers: { ...this.headers(target), Depth: '0' },
        fetch: this.fetch,
      }),
    );
    const { items, root } = multistatus(responses);
    const collection = pathOf(target.calendarUrl, target.calendarUrl);
    const changes: SyncChanges = { token: text(root.syncToken), changed: [], deleted: [] };
    for (const item of items) {
      if (!item.href) continue;
      const href = pathOf(item.href, target.calendarUrl);
      if (href === collection) continue;
      if (item.status === 404) changes.deleted.push(href);
      else changes.changed.push({ href, etag: text(item.props?.getetag) });
    }
    return changes;
  }

  // Objects deleted since they were listed come back as 404 and are left out.
  async fetchObjects(target: CaldavTarget, hrefs: string[]): Promise<FetchedObject[]> {
    const responses = await this.send(() =>
      calendarMultiGet({
        url: target.calendarUrl,
        props: { 'd:getetag': {}, 'c:calendar-data': {} },
        objectUrls: hrefs,
        depth: '1',
        headers: this.headers(target),
        fetch: this.fetch,
      }),
    );
    return multistatus(responses).items.flatMap((item) => {
      const data = item.props?.calendarData as { _cdata?: string } | string | undefined;
      const ics = typeof data === 'string' ? data : data?._cdata;
      if (!item.href || !item.ok || !ics) return [];
      return [
        { href: pathOf(item.href, target.calendarUrl), etag: text(item.props?.getetag), ics },
      ];
    });
  }

  async createObject(target: CaldavTarget, filename: string, ics: string): Promise<void> {
    await this.write(() =>
      createObject({
        url: new URL(filename, target.calendarUrl).href,
        data: ics,
        headers: {
          ...this.headers(target),
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*',
        },
        fetch: this.fetch,
      }),
    );
  }

  async updateObject(target: CaldavTarget, href: string, etag: string | null, ics: string) {
    await this.write(() =>
      updateObject({
        url: new URL(href, target.calendarUrl).href,
        data: ics,
        etag: etag ?? undefined,
        headers: { ...this.headers(target), 'Content-Type': 'text/calendar; charset=utf-8' },
        fetch: this.fetch,
      }),
    );
  }

  async deleteObject(target: CaldavTarget, href: string, etag: string | null): Promise<void> {
    await this.write(() =>
      deleteObject({
        url: new URL(href, target.calendarUrl).href,
        etag: etag ?? undefined,
        headers: this.headers(target),
        fetch: this.fetch,
      }),
    );
  }

  private headers(target: CaldavTarget): Record<string, string> {
    const credentials = Buffer.from(`${target.username}:${target.password}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  }

  private async send<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (err) {
      throw new CaldavUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }

  private async write(request: () => Promise<Response>): Promise<void> {
    const response = await this.send(request);
    if (!response.ok) throw errorForStatus(response.status, await response.text());
  }
}
