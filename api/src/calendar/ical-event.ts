import ICAL from 'ical.js';

// Builds/reads the standard iCalendar (RFC 5545) event bodies CalDAV
// servers store — see devlog day 12: CalDAV/iCalendar are vendor-neutral
// standards, not Apple-specific, and recurrence expansion is the server's
// job (RRULE just needs to be written/read correctly here).

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
  start: string;
  end: string;
  description: string | null;
  location: string | null;
  rrule: string | null;
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

export function parseEventIcs(ics: string): ParsedEvent {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const vevent = calendar.getFirstSubcomponent('vevent');
  if (!vevent) throw new Error('event body has no VEVENT component');
  const event = new ICAL.Event(vevent);
  const rrule = vevent.getFirstPropertyValue('rrule') as ICAL.Recur | null;

  return {
    uid: event.uid,
    summary: event.summary,
    start: event.startDate.toJSDate().toISOString(),
    end: event.endDate.toJSDate().toISOString(),
    description: event.description || null,
    location: event.location || null,
    rrule: rrule ? rrule.toString() : null,
  };
}
