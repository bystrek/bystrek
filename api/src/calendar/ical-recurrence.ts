import ICAL from 'ical.js';
import { isValidTimeZone, wallClockToDate } from './zoned-time';

// Expands raw iCalendar (RFC 5545) events into the occurrences that overlap
// a window: RRULE, RDATE, EXDATE, RECURRENCE-ID overrides, all-day and
// floating times, and TZIDs with no VTIMEZONE. CalDAV `expand` is not
// needed — the same result must come out of a raw calendar object as out
// of the server's own expansion (see `bun run eval:caldav-parity`).

export interface Occurrence {
  // The VEVENT carrying this occurrence's own properties: an override for a
  // moved or edited instance, otherwise the series master.
  item: ICAL.Event;
  // The series master, for properties an override leaves out. Equal to
  // `item` for a non-recurring event or an override with no master.
  master: ICAL.Event;
  start: Date;
  end: Date;
}

const MAX_RECURRENCE_ITERATIONS = 10_000;

// ical.js resolves a TZID only against a VTIMEZONE in the same body.
// Without one it silently falls back to the API process's own timezone —
// UTC in the container, so 19:00 Europe/Warsaw came out as 20:00. Read
// those wall-clock times in the named TZID instead, and truly floating
// times (no TZID, or one that isn't IANA) in the user's timezone, per
// RFC 5545 §3.3.5. All-day dates are floating too: midnight in `timeZone`.
function toDate(time: ICAL.Time, tzid: string | null, timeZone: string): Date {
  if (time.zone !== ICAL.Timezone.localTimezone) return time.toJSDate();
  return wallClockToDate(time, tzid && isValidTimeZone(tzid) ? tzid : timeZone);
}

function tzidOf(event: ICAL.Event, name: 'dtstart' | 'dtend'): string | null {
  const tzid = event.component.getFirstProperty(name)?.getParameter('tzid');
  return typeof tzid === 'string' ? tzid : null;
}

// An end derived from DURATION shares the start's timezone.
export function occurrenceDates(
  event: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  timeZone: string,
): { start: Date; end: Date } {
  const startTzid = tzidOf(event, 'dtstart');
  return {
    start: toDate(start, startTzid, timeZone),
    end: toDate(end, tzidOf(event, 'dtend') ?? startTzid, timeZone),
  };
}

function isCancelled(event: ICAL.Event): boolean {
  return event.component.getFirstPropertyValue('status') === 'CANCELLED';
}

function isExcluded(series: ICAL.Event, time: ICAL.Time): boolean {
  return series.component
    .getAllProperties('exdate')
    .some((property) =>
      property.getValues().some((value) => (value as ICAL.Time).compare(time) === 0),
    );
}

// ical.js yields DTSTART only through an RRULE iterator, so a series made of
// RDATEs alone would lose its first instance. RFC 5545 §3.8.5.2 counts
// DTSTART as part of every recurrence set. Such a set is finite and may hold
// RDATEs before DTSTART, so it is sorted before the caller stops at the
// range end.
function* seriesStarts(series: ICAL.Event): Generator<ICAL.Time> {
  const iterator = series.iterator();
  let occurrence: ICAL.Time | null;
  if (series.component.hasProperty('rrule')) {
    while ((occurrence = iterator.next())) yield occurrence;
    return;
  }
  const starts = isExcluded(series, series.startDate) ? [] : [series.startDate];
  while ((occurrence = iterator.next())) starts.push(occurrence.clone());
  yield* starts.sort((a, b) => a.compare(b));
}

// Sorted by start. `timeZone` must already be a valid IANA name.
export function expandOccurrences(
  calendar: ICAL.Component,
  range: { start: Date; end: Date },
  timeZone: string,
): Occurrence[] {
  const components = calendar.getAllSubcomponents('vevent');
  if (!components.length) throw new Error('event body has no VEVENT component');
  const events = components.map((component) => new ICAL.Event(component, { exceptions: [] }));
  const masters = events.filter((event) => !event.isRecurrenceException());
  const results: Occurrence[] = [];
  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, master = item) => {
    if (isCancelled(item)) return;
    const dates = occurrenceDates(item, start, end, timeZone);
    if (dates.start < range.end && dates.end > range.start) {
      results.push({ item, master, ...dates });
    }
  };

  for (const master of masters) {
    const exceptions = events.filter(
      (event) => event.isRecurrenceException() && event.uid === master.uid,
    );
    if (!master.isRecurring()) {
      add(master, master.startDate, master.endDate);
      for (const exception of exceptions) {
        add(exception, exception.startDate, exception.endDate);
      }
      continue;
    }

    const series = new ICAL.Event(master.component, { exceptions, strictExceptions: true });
    const seriesTzid = tzidOf(series, 'dtstart');
    const seen = new Set<string>();
    let iterations = 0;
    for (const occurrence of seriesStarts(series)) {
      if (++iterations > MAX_RECURRENCE_ITERATIONS) {
        throw new Error('calendar recurrence exceeds the supported range');
      }
      if (toDate(occurrence, seriesTzid, timeZone) >= range.end) break;
      if (seen.has(occurrence.toString())) continue;
      seen.add(occurrence.toString());
      const details = series.getOccurrenceDetails(occurrence);
      add(details.item, details.startDate, details.endDate, series);
    }
    for (const exception of exceptions) {
      if (!seen.has(exception.recurrenceId.toString())) {
        add(exception, exception.startDate, exception.endDate, series);
      }
    }
  }

  for (const exception of events.filter(
    (event) => event.isRecurrenceException() && !masters.some((master) => master.uid === event.uid),
  )) {
    add(exception, exception.startDate, exception.endDate);
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}
