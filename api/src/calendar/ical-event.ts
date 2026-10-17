import ICAL from 'ical.js';
import { formatZonedIso, weekdayName } from './zoned-time';

// Builds/reads the standard iCalendar (RFC 5545) event bodies CalDAV
// servers store. List results expand recurrences locally, whether or not
// the CalDAV server honors the requested expansion.

export interface EventInput {
  summary: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  // Raw RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=TU". Omit for a
  // non-recurring event.
  rrule?: string;
}

export interface ParsedEvent {
  uid: string;
  summary: string;
  // ISO 8601 with an explicit UTC offset for the timezone `parseEventIcs`
  // was called with (e.g. "2026-08-24T06:00:00+02:00") — never raw UTC.
  // The model reading this should never need to convert timezones itself;
  // see devlog day 12.
  start: string;
  end: string;
  // English weekday for start/end in the requested timezone, attached so
  // the model never has to derive the day-of-week from the ISO date
  // itself (that arithmetic is where it went wrong in issue #18).
  startWeekday: string;
  endWeekday: string;
  description: string | null;
  location: string | null;
  rrule: string | null;
}

const MAX_RECURRENCE_ITERATIONS = 10_000;

function eventDetails(
  event: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  timeZone: string,
  master: ICAL.Event = event,
): ParsedEvent {
  const startJs = start.toJSDate();
  const endJs = end.toJSDate();
  const rrule = master.component.getFirstPropertyValue('rrule') as ICAL.Recur | null;
  return {
    uid: master.uid,
    summary: event.component.hasProperty('summary') ? event.summary : master.summary,
    start: formatZonedIso(startJs, timeZone),
    end: formatZonedIso(endJs, timeZone),
    startWeekday: weekdayName(startJs, timeZone),
    endWeekday: weekdayName(endJs, timeZone),
    description: event.component.hasProperty('description')
      ? event.description || null
      : master.description || null,
    location: event.component.hasProperty('location')
      ? event.location || null
      : master.location || null,
    rrule: rrule ? rrule.toString() : null,
  };
}

function isCancelled(event: ICAL.Event): boolean {
  return event.component.getFirstPropertyValue('status') === 'CANCELLED';
}

export function parseEventOccurrences(
  ics: string,
  range: { start: Date; end: Date },
  timeZone: string,
): ParsedEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const components = calendar.getAllSubcomponents('vevent');
  if (!components.length) throw new Error('event body has no VEVENT component');
  const events = components.map((component) => new ICAL.Event(component, { exceptions: [] }));
  const masters = events.filter((event) => !event.isRecurrenceException());
  const results: ParsedEvent[] = [];
  const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, master = event) => {
    if (isCancelled(event)) return;
    const startJs = start.toJSDate();
    const endJs = end.toJSDate();
    if (startJs < range.end && endJs > range.start) {
      results.push(eventDetails(event, start, end, timeZone, master));
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
    const seen = new Set<string>();
    const iterator = series.iterator();
    let iterations = 0;
    let occurrence: ICAL.Time | null;
    while ((occurrence = iterator.next())) {
      if (++iterations > MAX_RECURRENCE_ITERATIONS) {
        throw new Error('calendar recurrence exceeds the supported range');
      }
      if (occurrence.toJSDate() >= range.end) break;
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

  return results.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function buildEventIcs(uid: string, input: EventInput): string {
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('prodid', '-//bystrek.dev//calendar//EN');
  calendar.updatePropertyWithValue('version', '2.0');

  const vevent = new ICAL.Component('vevent');
  const event = new ICAL.Event(vevent);
  event.uid = uid;
  event.summary = input.summary;
  event.startDate = ICAL.Time.fromJSDate(input.start, true);
  event.endDate = ICAL.Time.fromJSDate(input.end, true);
  if (input.description) event.description = input.description;
  if (input.location) event.location = input.location;
  if (input.rrule) {
    vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromString(input.rrule));
  }
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  calendar.addSubcomponent(vevent);
  return calendar.toString();
}

// Applies a partial update to an existing event's ICS body, returning the
// re-serialized ICS. Only fields present in `input` are changed.
export function updateEventIcs(ics: string, input: Partial<EventInput>): string {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const vevent = calendar.getFirstSubcomponent('vevent');
  if (!vevent) throw new Error('event body has no VEVENT component');
  const event = new ICAL.Event(vevent);

  if (input.summary !== undefined) event.summary = input.summary;
  if (input.start !== undefined) event.startDate = ICAL.Time.fromJSDate(input.start, true);
  if (input.end !== undefined) event.endDate = ICAL.Time.fromJSDate(input.end, true);
  if (input.description !== undefined) event.description = input.description;
  if (input.location !== undefined) event.location = input.location;
  if (input.rrule !== undefined) {
    if (input.rrule) {
      vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromString(input.rrule));
    } else {
      vevent.removeProperty('rrule');
    }
  }
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  return calendar.toString();
}

export function parseEventIcs(ics: string, timeZone: string): ParsedEvent {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const vevent =
    calendar
      .getAllSubcomponents('vevent')
      .find((component) => !component.hasProperty('recurrence-id')) ??
    calendar.getFirstSubcomponent('vevent');
  if (!vevent) throw new Error('event body has no VEVENT component');
  const event = new ICAL.Event(vevent);
  return eventDetails(event, event.startDate, event.endDate, timeZone);
}
