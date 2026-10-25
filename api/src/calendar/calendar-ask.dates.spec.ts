/// <reference lib="esnext.temporal" />
import { describe, expect, it } from 'bun:test';
import { resolveWhen, type WhenWords } from './calendar-ask.dates';
import { parseZonedIso } from './zoned-time';

const TZ = 'Europe/Warsaw';
// Sunday 2026-10-25, 18:00 in Warsaw, the day DST ended.
const NOW = new Date('2026-10-25T18:00:00+01:00');

function resolve(words: WhenWords, now = NOW) {
  const window = resolveWhen(words, now, TZ);
  return window && { start: new Date(window.start), end: new Date(window.end) };
}

// Local midnight to the next local midnight, so the 25-hour DST day is exact.
function day(date: string) {
  const next = Temporal.PlainDate.from(date).add({ days: 1 }).toString();
  return { start: parseZonedIso(`${date}T00:00`, TZ), end: parseZonedIso(`${next}T00:00`, TZ) };
}

describe('resolveWhen', () => {
  it('defaults to today and counts today, tomorrow and offsets from today', () => {
    expect(resolve({})).toEqual(day('2026-10-25'));
    expect(resolve({ day: 'today' })).toEqual(day('2026-10-25'));
    expect(resolve({ day: 'Tomorrow' })).toEqual(day('2026-10-26'));
    expect(resolve({ day: '+2' })).toEqual(day('2026-10-27'));
    expect(resolve({ day: 'day_after_tomorrow' })).toEqual(day('2026-10-27'));
    expect(resolve({ day: 'the day after tomorrow' })).toEqual(day('2026-10-27'));
    expect(resolve({ day: 'Jutro' })).toEqual(day('2026-10-26'));
    expect(resolve({ day: 'pojutrze' })).toEqual(day('2026-10-27'));
    expect(resolve({ day: 'dzisiaj' })).toEqual(day('2026-10-25'));
  });

  it('starts today at local midnight across the DST change', () => {
    expect(resolve({ day: 'today' })?.start).toEqual(new Date('2026-10-25T00:00:00+02:00'));
  });

  it('maps a weekday to its next occurrence, today included', () => {
    expect(resolve({ day: 'sun' })).toEqual(day('2026-10-25'));
    expect(resolve({ day: 'mon' })).toEqual(day('2026-10-26'));
    expect(resolve({ day: 'thursday' })).toEqual(day('2026-10-29'));
  });

  it('maps a day of the month to its next occurrence', () => {
    expect(resolve({ day: '14' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: '25' })).toEqual(day('2026-10-25'));
    // November has 30 days, so the next 31st after Nov 1 is Dec 31.
    expect(resolve({ day: '31' }, new Date('2026-11-01T12:00:00+01:00'))).toEqual(
      day('2026-12-31'),
    );
  });

  it('rolls a month and day into next year once it has passed', () => {
    expect(resolve({ day: '14 nov' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: 'March 3rd' })).toEqual(day('2027-03-03'));
    expect(resolve({ day: '3 of march' })).toEqual(day('2027-03-03'));
  });

  it('finds the next Feb 29 in a later leap year', () => {
    expect(resolve({ day: '29 feb' })).toEqual(day('2028-02-29'));
    expect(resolve({ day: '30 feb' })).toBeUndefined();
  });

  it('keeps a year the question names, even in the past', () => {
    expect(resolve({ day: '14 nov 2027' })).toEqual(day('2027-11-14'));
    expect(resolve({ day: 'November 14th, 2027' })).toEqual(day('2027-11-14'));
    expect(resolve({ day: '2027-11-14' })).toEqual(day('2027-11-14'));
    expect(resolve({ day: '3 mar 2026' })).toEqual(day('2026-03-03'));
    expect(resolve({ day: '14 nov 1066' })).toBeUndefined();
  });

  it('treats words that name Object.prototype members as unknown', () => {
    expect(resolve({ day: 'constructor' })).toBeUndefined();
    expect(resolve({ day: 'today', time: 'constructor' })).toBeUndefined();
    expect(resolve({ day: 'today', time: 'toString' })).toBeUndefined();
  });

  it('reads a numeric day and month only when one order is the only valid one', () => {
    expect(resolve({ day: '11-14' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: '14-11' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: '14.11' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: '05-11' })).toBeUndefined();
  });

  it('accepts abbreviated and misspelled day words, rejecting ambiguous ones', () => {
    expect(resolve({ day: 'tommorow' })).toEqual(day('2026-10-26'));
    expect(resolve({ day: 'tomor' })).toEqual(day('2026-10-26'));
    expect(resolve({ day: 'thur' })).toEqual(day('2026-10-29'));
    expect(resolve({ day: 'wensday' })).toEqual(day('2026-10-28'));
    expect(resolve({ day: '14th' })).toEqual(day('2026-11-14'));
    expect(resolve({ day: 'tu' })).toBeUndefined();
    expect(resolve({ day: 'ju' })).toBeUndefined();
    expect(resolve({ day: '14 ju' })).toBeUndefined();
  });

  it('narrows a day to a period or to one hour from a clock time', () => {
    expect(resolve({ day: 'tomorrow', time: 'afternoon' })).toEqual({
      start: new Date('2026-10-26T12:00:00+01:00'),
      end: new Date('2026-10-26T18:00:00+01:00'),
    });
    expect(resolve({ day: 'tomorrow', time: 'evening' })?.end).toEqual(
      new Date('2026-10-27T00:00:00+01:00'),
    );
    expect(resolve({ day: 'tomorrow', time: '9:15' })).toEqual({
      start: new Date('2026-10-26T09:15:00+01:00'),
      end: new Date('2026-10-26T10:15:00+01:00'),
    });
  });

  it('reads bare hours and 12-hour clock times', () => {
    const tomorrowAt = (time: string) => resolve({ day: 'tomorrow', time })?.start;
    expect(tomorrowAt('10')).toEqual(new Date('2026-10-26T10:00:00+01:00'));
    expect(tomorrowAt('3pm')).toEqual(new Date('2026-10-26T15:00:00+01:00'));
    expect(tomorrowAt('9:30 am')).toEqual(new Date('2026-10-26T09:30:00+01:00'));
    expect(tomorrowAt('12am')).toEqual(new Date('2026-10-26T00:00:00+01:00'));
    expect(tomorrowAt('12pm')).toEqual(new Date('2026-10-26T12:00:00+01:00'));
    expect(tomorrowAt('13pm')).toBeUndefined();
  });

  it('spans whole days until a last day resolved from the first', () => {
    expect(resolve({ day: 'tomorrow', until: 'wed' })).toEqual({
      start: day('2026-10-26').start,
      end: day('2026-10-28').end,
    });
  });

  it('resolves this and next Mon-Sun week', () => {
    expect(resolve({ range: 'this_week' })).toEqual({
      start: new Date('2026-10-19T00:00:00+02:00'),
      end: day('2026-10-26').start,
    });
    expect(resolve({ range: 'next_week' })).toEqual({
      start: day('2026-10-26').start,
      end: day('2026-11-02').start,
    });
  });

  it('rejects words it does not know and impossible dates', () => {
    expect(resolve({ day: 'someday' })).toBeUndefined();
    expect(resolve({ day: '02-30' })).toBeUndefined();
    expect(resolve({ day: '+400' })).toBeUndefined();
    expect(resolve({ day: 'today', time: '25:00' })).toBeUndefined();
    expect(resolve({ day: 'today', time: 'noonish' })).toBeUndefined();
    expect(resolve({ range: 'last_week' })).toBeUndefined();
    expect(resolve({ day: 7 })).toBeUndefined();
  });
});
