/// <reference lib="esnext.temporal" />

// CalDAV parity check for the local calendar copy (#135). Against the real calendar of one
// user, it compares the occurrences iCloud expands (`expand: true`, one REPORT per month) with
// the ones `parseEventOccurrences` expands from the raw objects, and prints every difference.
// It then records what the server supports for change detection: `getctag`, `sync-token`,
// `sync-collection`, and the reply to a sync token the server doesn't know.
//
// Read-only: it never writes to the calendar or the database. Not part of `bun test` or CI.
// Run from api/ (bun loads api/.env; credentials come from the database at DATABASE_URL):
//   bun run eval:caldav-parity [--email owner@example.com] [--months 12] [--tz Europe/Warsaw]

import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createDAVClient, type DAVCalendar } from 'tsdav';
import { CalendarCredentialsService } from '../src/calendar/calendar-credentials.service';
import { parseEventOccurrences, type ParsedEvent } from '../src/calendar/ical-event';
import {
  assertValidTimeZone,
  currentDate,
  fromEpochMs,
  zonedDateTime,
} from '../src/calendar/zoned-time';
import { DATABASE_URL } from '../src/env';
import * as schema from '../src/db/schema';
import { users } from '../src/db/schema';

const { values: args } = parseArgs({
  options: {
    email: { type: 'string', default: process.env.SEED_OWNER_EMAIL },
    months: { type: 'string', default: '12' },
    tz: { type: 'string', default: 'Europe/Warsaw' },
  },
});
const TZ = args.tz!;
assertValidTimeZone(TZ);
const MONTHS = Number(args.months);
if (!Number.isInteger(MONTHS) || MONTHS < 1) throw new Error('--months must be a positive integer');
if (!args.email) throw new Error('pass --email or set SEED_OWNER_EMAIL');

// Same identity as an occurrence the UI would show: which event, when, and what it says.
function key(event: ParsedEvent): string {
  return `${event.start} → ${event.end}  ${event.summary}  [${event.uid}]`;
}

function monthWindows(): { start: Date; end: Date }[] {
  const first = zonedDateTime(currentDate(), TZ).startOfDay().with({ day: 1 });
  return Array.from({ length: MONTHS }, (_, i) => ({
    start: fromEpochMs(first.add({ months: i }).epochMilliseconds),
    end: fromEpochMs(first.add({ months: i + 1 }).epochMilliseconds),
  }));
}

async function loadCredentials() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(sql, { schema });
    const [user] = await db.select().from(users).where(eq(users.email, args.email!));
    if (!user) throw new Error(`no user with email ${args.email}`);
    const creds = await new CalendarCredentialsService(db).getInternal(user.id);
    if (!creds) throw new Error(`${args.email} has no calendar connected`);
    return creds;
  } finally {
    await sql.end();
  }
}

async function parity(
  client: Awaited<ReturnType<typeof createDAVClient>>,
  calendar: DAVCalendar,
): Promise<number> {
  const windows = monthWindows();
  const range = { start: windows[0].start, end: windows[windows.length - 1].end };
  console.log(`\n## Expansion parity, ${range.start.toISOString()} → ${range.end.toISOString()}`);

  const server = new Map<string, ParsedEvent>();
  for (const window of windows) {
    const objects = await client.fetchCalendarObjects({
      calendar,
      expand: true,
      timeRange: { start: window.start.toISOString(), end: window.end.toISOString() },
    });
    for (const object of objects) {
      if (!object.data) continue;
      for (const event of parseEventOccurrences(object.data as string, window, TZ)) {
        server.set(key(event), event);
      }
    }
  }

  // The local copy will hold every raw object, so fetch them all with no time filter.
  const raw = await client.fetchCalendarObjects({ calendar });
  const local = new Map<string, ParsedEvent>();
  const failures: string[] = [];
  const recurring = { rrule: 0, rdate: 0, overrides: 0 };
  for (const object of raw) {
    if (!object.data) continue;
    const data = object.data as string;
    if (/^RRULE[:;]/m.test(data)) recurring.rrule++;
    if (/^RDATE[:;]/m.test(data)) recurring.rdate++;
    if (/^RECURRENCE-ID[:;]/m.test(data)) recurring.overrides++;
    try {
      for (const event of parseEventOccurrences(data, range, TZ)) local.set(key(event), event);
    } catch (error) {
      failures.push(`${object.url}: ${(error as Error).message}`);
    }
  }

  const onlyServer = [...server.keys()].filter((k) => !local.has(k)).sort();
  const onlyLocal = [...local.keys()].filter((k) => !server.has(k)).sort();
  const detailDiffs = [...server.entries()].flatMap(([k, event]) => {
    const mine = local.get(k);
    if (!mine) return [];
    const fields = (['location', 'description'] as const).filter((f) => event[f] !== mine[f]);
    return fields.length ? [`${k}: ${fields.join(', ')} differ`] : [];
  });

  console.log(
    `raw objects: ${raw.length} (with RRULE ${recurring.rrule}, RDATE ${recurring.rdate}, ` +
      `overrides ${recurring.overrides}), with etag: ${raw.filter((o) => o.etag).length}`,
  );
  console.log(`occurrences: server ${server.size}, local ${local.size}`);
  for (const [title, lines] of [
    ['only in server expansion', onlyServer],
    ['only in local expansion', onlyLocal],
    ['same occurrence, different details', detailDiffs],
    ['objects that failed to parse', failures],
  ] as const) {
    console.log(`${title}: ${lines.length}`);
    for (const line of lines) console.log(`  ${line}`);
  }
  return onlyServer.length + onlyLocal.length + detailDiffs.length + failures.length;
}

function tokenOf(body: string): string | null {
  return /<(?:\w+:)?sync-token(?:\s[^>]*)?>([^<]*)</.exec(body)?.[1] ?? null;
}

async function syncFindings(calendar: DAVCalendar, authorization: string): Promise<void> {
  console.log('\n## Change detection');
  console.log(`getctag from PROPFIND: ${calendar.ctag ?? '(none)'}`);
  console.log(`sync-token from PROPFIND: ${calendar.syncToken ?? '(none)'}`);
  console.log(`supported reports: ${(calendar.reports ?? []).join(', ') || '(none listed)'}`);

  const syncCollection = async (label: string, token: string) => {
    const response = await fetch(calendar.url, {
      method: 'REPORT',
      headers: { Authorization: authorization, 'Content-Type': 'application/xml', Depth: '0' },
      body:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<d:sync-collection xmlns:d="DAV:">' +
        `<d:sync-token>${token}</d:sync-token><d:sync-level>1</d:sync-level>` +
        '<d:prop><d:getetag/></d:prop></d:sync-collection>',
    });
    const body = await response.text();
    const changes = (body.match(/<(?:\w+:)?response[\s>]/g) ?? []).length;
    console.log(
      `sync-collection, ${label}: HTTP ${response.status}, ${changes} responses, ` +
        `new token ${tokenOf(body) ?? '(none)'}`,
    );
    if (!response.ok) console.log(`  body: ${body.slice(0, 600).replace(/\s+/g, ' ')}`);
    return tokenOf(body);
  };

  const initial = await syncCollection('initial (empty token)', '');
  if (!initial) return;
  await syncCollection('with the token just returned', initial);
  if (calendar.syncToken && calendar.syncToken !== initial) {
    await syncCollection('with the PROPFIND token', calendar.syncToken);
  }
  // A token can't be made to expire on demand. Where it ends in a revision number (SabreDAV's
  // `…/sync/107`), an older revision shows whether past changes are replayed, and one the
  // server hasn't reached yet shows whether it checks the token at all.
  const revision = /^(.*?)(\d+)$/.exec(initial);
  if (revision) {
    const [, prefix, number] = revision;
    await syncCollection('with the oldest revision', `${prefix}1`);
    await syncCollection('with the previous revision', `${prefix}${Number(number) - 1}`);
    await syncCollection('with a future revision', `${prefix}${Number(number) + 1000}`);
  } else {
    // An opaque token (iCloud's base64 blob) with one character changed: well-formed, but
    // never issued.
    const middle = Math.floor(initial.length / 2);
    const changed = initial[middle] === 'A' ? 'B' : 'A';
    await syncCollection(
      'with one character of the token changed',
      initial.slice(0, middle) + changed + initial.slice(middle + 1),
    );
  }
  await syncCollection('with a malformed token', 'not-a-sync-token');
}

async function main() {
  const creds = await loadCredentials();
  const client = await createDAVClient({
    serverUrl: creds.caldavUrl,
    credentials: { username: creds.username, password: creds.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  const calendar = creds.calendarUrl
    ? calendars.find((c) => c.url === creds.calendarUrl)
    : calendars[0];
  if (!calendar) throw new Error(`calendar ${creds.calendarUrl} not found on the account`);
  console.log(`calendar: ${String(calendar.displayName ?? calendar.url)}, timezone ${TZ}`);

  const diffs = await parity(client, calendar);
  const authorization = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
  await syncFindings(calendar, authorization);

  console.log(diffs ? `\n${diffs} difference(s)` : '\nno differences');
  process.exitCode = diffs ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
