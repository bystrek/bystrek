// An in-memory CalDAV calendar behind a `fetch`, for the calendar copy's integration tests.
// It answers the requests the sync engine makes (depth-0 PROPFIND, sync-collection,
// calendar-multiget, PUT, DELETE) the way #135 found iCloud and SabreDAV answer them, and
// records every request so tests can count them.

const XML = { 'Content-Type': 'application/xml; charset=utf-8' };

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function multistatus(responses: string[], syncToken?: string): Response {
  const token = syncToken === undefined ? '' : `<d:sync-token>${syncToken}</d:sync-token>`;
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?>` +
      `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" ` +
      `xmlns:cs="http://calendarserver.org/ns/">${responses.join('')}${token}</d:multistatus>`,
    { status: 207, headers: XML },
  );
}

function propResponse(href: string, props: string): string {
  return (
    `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop>` +
    `<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
  );
}

function goneResponse(href: string): string {
  return `<d:response><d:href>${href}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;
}

export function eventIcs(uid: string, summary: string, start = '20260901T100000Z'): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DTSTART:${start}`,
    `DTEND:${start.replace(/T10/, 'T11')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export class FakeCaldav {
  calendarUrl = 'https://p01-caldav.example.com/123/calendars/home/';
  readonly requests: { method: string; url: string; body: string }[] = [];
  // Every request fails as if the server were down.
  unreachable = false;
  // Every sync token is rejected with 403 DAV:valid-sync-token, as when one expires.
  rejectTokens = false;
  // Multiget requests left before they start failing with 500; null never fails.
  multigetsBeforeFailure: number | null = null;
  // Added to every reply, so concurrent requests overlap.
  delayMs = 0;
  // The calendar moves to this URL right after the next PROPFIND is answered.
  moveAfterPropfind: string | null = null;

  private readonly objects = new Map<string, { etag: string; ics: string }>();
  private readonly changes: { revision: number; href: string }[] = [];
  private revision = 1;
  private movedFrom: string | null = null;

  get path(): string {
    return new URL(this.calendarUrl).pathname;
  }

  put(name: string, ics: string): void {
    const href = `${this.path}${name}`;
    this.revision++;
    this.objects.set(href, { etag: `"${this.revision}"`, ics });
    this.changes.push({ revision: this.revision, href });
  }

  remove(name: string): void {
    const href = `${this.path}${name}`;
    this.revision++;
    this.objects.delete(href);
    this.changes.push({ revision: this.revision, href });
  }

  // Like iCloud moving the account to another partition host: the old URL answers 301.
  moveTo(calendarUrl: string): void {
    this.movedFrom = new URL(this.calendarUrl).host;
    this.calendarUrl = calendarUrl;
  }

  count(kind: 'PROPFIND' | 'sync-collection' | 'calendar-multiget'): number {
    return this.requests.filter((r) =>
      kind === 'PROPFIND' ? r.method === 'PROPFIND' : r.body.includes(kind),
    ).length;
  }

  private token(revision = this.revision): string {
    return `http://sabre.io/ns/sync/${revision}`;
  }

  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    this.requests.push({ method, url: url.href, body });
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.unreachable) throw new TypeError('fetch failed');
    if (this.movedFrom && url.host === this.movedFrom) {
      return new Response(null, { status: 301, headers: { Location: this.calendarUrl } });
    }
    const headers = new Headers(init?.headers);

    if (method === 'PROPFIND') {
      if (url.pathname !== this.path) return new Response(null, { status: 404 });
      const tag = `<cs:getctag>${this.revision}</cs:getctag><d:sync-token>${this.token()}</d:sync-token>`;
      if (this.moveAfterPropfind) {
        this.moveTo(this.moveAfterPropfind);
        this.moveAfterPropfind = null;
      }
      return multistatus([propResponse(url.pathname, tag)]);
    }
    if (method === 'REPORT' && body.includes('sync-collection')) return this.syncCollection(body);
    if (method === 'REPORT' && body.includes('calendar-multiget')) return this.multiget(body);

    const object = this.objects.get(url.pathname);
    const ifMatch = headers.get('If-Match');
    if (ifMatch && object?.etag !== ifMatch) return new Response(null, { status: 412 });
    if (method === 'PUT') {
      if (headers.get('If-None-Match') === '*' && object)
        return new Response(null, { status: 412 });
      this.put(url.pathname.slice(this.path.length), body);
      return new Response(null, { status: object ? 204 : 201 });
    }
    if (method === 'DELETE') {
      if (!object) return new Response(null, { status: 404 });
      this.remove(url.pathname.slice(this.path.length));
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;

  private syncCollection(body: string): Response {
    const token = /<d:sync-token>([^<]*)<\/d:sync-token>/.exec(body)?.[1] ?? '';
    let since = 0;
    if (token) {
      const revision = /\/sync\/(\d+)$/.exec(token)?.[1];
      if (this.rejectTokens || !revision || Number(revision) > this.revision) {
        return new Response(
          `<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>`,
          { status: 403, headers: XML },
        );
      }
      since = Number(revision);
    }
    const hrefs = token
      ? new Set(this.changes.filter((c) => c.revision > since).map((c) => c.href))
      : new Set(this.objects.keys());
    const responses = [...hrefs].map((href) => {
      const object = this.objects.get(href);
      return object
        ? propResponse(href, `<d:getetag>${object.etag}</d:getetag>`)
        : goneResponse(href);
    });
    // iCloud lists the collection itself in a full listing.
    if (!token) responses.unshift(propResponse(this.path, ''));
    return multistatus(responses, this.token());
  }

  private multiget(body: string): Response {
    if (this.multigetsBeforeFailure !== null) {
      if (this.multigetsBeforeFailure === 0) return new Response('boom', { status: 500 });
      this.multigetsBeforeFailure--;
    }
    const hrefs = [...body.matchAll(/<d:href>([^<]*)<\/d:href>/g)].map((m) => m[1]);
    return multistatus(
      hrefs.map((href) => {
        const object = this.objects.get(href);
        if (!object) return goneResponse(href);
        return propResponse(
          href,
          `<d:getetag>${object.etag}</d:getetag>` +
            `<c:calendar-data>${escapeXml(object.ics)}</c:calendar-data>`,
        );
      }),
    );
  }
}
