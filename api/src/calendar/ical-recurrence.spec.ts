import { describe, expect, it } from 'bun:test';
import ICAL from 'ical.js';
import { expandOccurrences } from './ical-recurrence';
import { formatZonedIso } from './zoned-time';

// RRULE, EXDATE, overrides and floating times are also covered through
// `parseEventOccurrences` in ical-event.spec.ts.

function calendarWith(...events: string[]): ICAL.Component {
  return new ICAL.Component(
    ICAL.parse(['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')),
  );
}

function eventWith(...properties: string[]): string {
  return ['BEGIN:VEVENT', ...properties, 'END:VEVENT'].join('\r\n');
}

const october = {
  start: new Date('2026-10-01T00:00:00Z'),
  end: new Date('2026-11-01T00:00:00Z'),
};

function expand(calendar: ICAL.Component, range = october, timeZone = 'Europe/Warsaw') {
  return expandOccurrences(calendar, range, timeZone).map((occurrence) => [
    occurrence.item.summary,
    formatZonedIso(occurrence.start, timeZone),
    formatZonedIso(occurrence.end, timeZone),
  ]);
}

describe('expandOccurrences: RDATE', () => {
  it('keeps DTSTART as the first instance of a series made only of RDATEs', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261005T100000Z',
        'DTEND:20261005T110000Z',
        'RDATE:20261020T150000Z,20261103T080000Z',
      ),
    );
    expect(expand(calendar)).toEqual([
      ['Lecture', '2026-10-05T12:00:00+02:00', '2026-10-05T13:00:00+02:00'],
      ['Lecture', '2026-10-20T17:00:00+02:00', '2026-10-20T18:00:00+02:00'],
    ]);
  });

  it('merges RDATEs into an RRULE series', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261005T100000Z',
        'DTEND:20261005T110000Z',
        'RRULE:FREQ=WEEKLY;COUNT=2',
        'RDATE:20261008T150000Z',
      ),
    );
    expect(expand(calendar).map(([, start]) => start)).toEqual([
      '2026-10-05T12:00:00+02:00',
      '2026-10-08T17:00:00+02:00',
      '2026-10-12T12:00:00+02:00',
    ]);
  });

  it('does not repeat an RDATE equal to DTSTART', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261005T100000Z',
        'DTEND:20261005T110000Z',
        'RDATE:20261005T100000Z,20261020T150000Z',
      ),
    );
    expect(expand(calendar)).toHaveLength(2);
  });

  it('applies EXDATE to DTSTART and RDATEs of an RRULE-less series', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261005T100000Z',
        'DTEND:20261005T110000Z',
        'RDATE:20261012T100000Z,20261020T150000Z',
        'EXDATE:20261005T100000Z,20261020T150000Z',
      ),
    );
    expect(expand(calendar).map(([, start]) => start)).toEqual(['2026-10-12T12:00:00+02:00']);
  });

  it('includes an in-range RDATE that comes before a DTSTART past the range end', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261203T100000Z',
        'DTEND:20261203T110000Z',
        'RDATE:20261020T150000Z,20261005T100000Z',
      ),
    );
    expect(expand(calendar).map(([, start]) => start)).toEqual([
      '2026-10-05T12:00:00+02:00',
      '2026-10-20T17:00:00+02:00',
    ]);
  });

  it('applies an override to an RDATE instance', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:rdate',
        'SUMMARY:Lecture',
        'DTSTART:20261005T100000Z',
        'DTEND:20261005T110000Z',
        'RDATE:20261020T150000Z',
      ),
      eventWith(
        'UID:rdate',
        'RECURRENCE-ID:20261020T150000Z',
        'SUMMARY:Guest lecture',
        'DTSTART:20261021T150000Z',
        'DTEND:20261021T160000Z',
      ),
    );
    expect(expand(calendar)).toEqual([
      ['Lecture', '2026-10-05T12:00:00+02:00', '2026-10-05T13:00:00+02:00'],
      ['Guest lecture', '2026-10-21T17:00:00+02:00', '2026-10-21T18:00:00+02:00'],
    ]);
  });
});

describe('expandOccurrences: all-day events', () => {
  it('spans local midnight to midnight in the requested timezone', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:holiday',
        'SUMMARY:Holiday',
        'DTSTART;VALUE=DATE:20261011',
        'DTEND;VALUE=DATE:20261012',
      ),
    );
    expect(expand(calendar)).toEqual([
      ['Holiday', '2026-10-11T00:00:00+02:00', '2026-10-12T00:00:00+02:00'],
    ]);
  });

  it('lasts one day when DTEND is missing', () => {
    const calendar = calendarWith(
      eventWith('UID:holiday', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261011'),
    );
    expect(expand(calendar)).toEqual([
      ['Holiday', '2026-10-11T00:00:00+02:00', '2026-10-12T00:00:00+02:00'],
    ]);
  });

  it('ends at local midnight across a DST change', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:trip',
        'SUMMARY:Trip',
        'DTSTART;VALUE=DATE:20261024',
        'DTEND;VALUE=DATE:20261027',
      ),
    );
    expect(
      expand(calendar, { start: october.start, end: new Date('2026-12-01T00:00:00Z') }),
    ).toEqual([['Trip', '2026-10-24T00:00:00+02:00', '2026-10-27T00:00:00+01:00']]);
  });

  it('expands a yearly all-day series and skips a DATE EXDATE', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:birthday',
        'SUMMARY:Birthday',
        'DTSTART;VALUE=DATE:20201015',
        'DTEND;VALUE=DATE:20201016',
        'RRULE:FREQ=YEARLY',
        'EXDATE;VALUE=DATE:20251015',
      ),
    );
    const years = {
      start: new Date('2024-01-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'),
    };
    expect(expand(calendar, years).map(([, start]) => start)).toEqual([
      '2024-10-15T00:00:00+02:00',
      '2026-10-15T00:00:00+02:00',
    ]);
  });

  it('includes an all-day event that has started but not ended at the range start', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:trip',
        'SUMMARY:Trip',
        'DTSTART;VALUE=DATE:20260929',
        'DTEND;VALUE=DATE:20261003',
      ),
    );
    expect(expand(calendar)).toHaveLength(1);
  });
});

describe('expandOccurrences: TZID with no VTIMEZONE', () => {
  it('matches EXDATE and RECURRENCE-ID by wall-clock time in that TZID', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:yoga',
        'SUMMARY:Yoga',
        'DTSTART;TZID=Europe/Warsaw:20261006T190000',
        'DTEND;TZID=Europe/Warsaw:20261006T200000',
        'RRULE:FREQ=WEEKLY;COUNT=5',
        'EXDATE;TZID=Europe/Warsaw:20261013T190000',
      ),
      eventWith(
        'UID:yoga',
        'SUMMARY:Yoga moved',
        'RECURRENCE-ID;TZID=Europe/Warsaw:20261027T190000',
        'DTSTART;TZID=Europe/Warsaw:20261028T180000',
        'DTEND;TZID=Europe/Warsaw:20261028T190000',
      ),
    );
    expect(
      expand(calendar, { start: october.start, end: new Date('2026-12-01T00:00:00Z') }),
    ).toEqual([
      ['Yoga', '2026-10-06T19:00:00+02:00', '2026-10-06T20:00:00+02:00'],
      ['Yoga', '2026-10-20T19:00:00+02:00', '2026-10-20T20:00:00+02:00'],
      ['Yoga moved', '2026-10-28T18:00:00+01:00', '2026-10-28T19:00:00+01:00'],
      ['Yoga', '2026-11-03T19:00:00+01:00', '2026-11-03T20:00:00+01:00'],
    ]);
  });

  it('ends a DURATION in the start TZID', () => {
    const calendar = calendarWith(
      eventWith(
        'UID:talk',
        'SUMMARY:Talk',
        'DTSTART;TZID=Europe/Warsaw:20261006T190000',
        'DURATION:PT90M',
      ),
    );
    expect(expand(calendar, october, 'UTC')).toEqual([
      ['Talk', '2026-10-06T17:00:00+00:00', '2026-10-06T18:30:00+00:00'],
    ]);
  });
});

describe('expandOccurrences: ordering', () => {
  it('sorts occurrences from several events by start', () => {
    const calendar = calendarWith(
      eventWith('UID:b', 'SUMMARY:Second', 'DTSTART:20261010T100000Z', 'DTEND:20261010T110000Z'),
      eventWith('UID:a', 'SUMMARY:First', 'DTSTART:20261009T100000Z', 'DTEND:20261009T110000Z'),
    );
    expect(expand(calendar).map(([summary]) => summary)).toEqual(['First', 'Second']);
  });
});
