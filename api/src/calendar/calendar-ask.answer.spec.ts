import { describe, expect, it } from 'bun:test';
import { matchesSearch } from './calendar-ask.answer';
import type { ParsedEvent } from './ical-event';

const titled = (summary: string) => ({ summary }) as ParsedEvent;

describe('matchesSearch', () => {
  it('ignores generic words the question adds around a title', () => {
    expect(matchesSearch(titled('Dentist'), 'dentist appointment')).toBe(true);
    expect(matchesSearch(titled('Board meeting'), 'board meeting')).toBe(true);
  });

  it('needs every distinctive word, so a shorter title does not match a longer search', () => {
    expect(matchesSearch(titled('Sprint review #12'), 'sprint review')).toBe(true);
    expect(matchesSearch(titled('Review'), 'sprint review')).toBe(false);
  });

  it('matches whole words or word starts, never fragments inside a word', () => {
    expect(matchesSearch(titled('AI'), 'haircut')).toBe(false);
    expect(matchesSearch(titled('Haircut'), 'ai')).toBe(false);
    expect(matchesSearch(titled('Daily standups'), 'standup')).toBe(true);
    expect(matchesSearch(titled('Yoga class'), 'yoga')).toBe(true);
  });

  it('falls back to generic words when the search has nothing else', () => {
    expect(matchesSearch(titled('Team meeting'), 'meeting')).toBe(true);
    expect(matchesSearch(titled('Dentist'), 'meeting')).toBe(false);
  });
});
