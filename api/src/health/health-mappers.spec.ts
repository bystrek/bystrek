import { describe, expect, it } from 'bun:test';
import { healthAutoExportSample } from '../../test/fixtures/health-auto-export.sample';
import {
  HealthCategory,
  type HealthData,
  mapHealthData,
  mapMedications,
  mapSleep,
  mapWeight,
  mapWorkouts,
} from './health-mappers';

const sample: HealthData = healthAutoExportSample.data;
const at = (iso: string) => new Date(iso);

describe('mapSleep', () => {
  it('makes one span per night, keyed by its date', () => {
    expect(mapSleep(sample)).toEqual({
      events: [
        {
          externalId: 'sleep_analysis:2026-11-10',
          category: HealthCategory.Sleep,
          text: 'Sleep, 7 h 12 min',
          occurredAt: at('2026-11-09T22:30:00Z'),
          endsAt: at('2026-11-10T06:00:00Z'),
          quantity: 7.2,
          unit: 'hr',
        },
      ],
      skipped: 0,
    });
  });

  it('keeps the id when a later push extends the night', () => {
    const night = (sleepEnd: string) => ({
      metrics: [
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [
            {
              date: '2026-11-10 00:00:00 +0100',
              sleepStart: '2026-11-09 23:30:00 +0100',
              sleepEnd,
            },
          ],
        },
      ],
    });
    const early = mapSleep(night('2026-11-10 03:00:00 +0100')).events[0];
    const late = mapSleep(night('2026-11-10 07:00:00 +0100')).events[0];
    expect(early.externalId).toBe(late.externalId);
    expect(late.text).toBe('Sleep');
  });

  it('skips per-stage samples, which need "Summarize Data" on', () => {
    const stages = {
      metrics: [
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [
            {
              date: '2026-11-10 00:00:00 +0100',
              startDate: '2026-11-09 23:30:00 +0100',
              endDate: '2026-11-10 00:10:00 +0100',
              qty: 0.67,
              value: 'Core',
            },
          ],
        },
      ],
    };
    expect(mapSleep(stages)).toEqual({ events: [], skipped: 1 });
  });

  it('skips a night that ends before it starts', () => {
    const backwards = {
      metrics: [
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [
            {
              date: '2026-11-10 00:00:00 +0100',
              sleepStart: '2026-11-10 07:00:00 +0100',
              sleepEnd: '2026-11-09 23:30:00 +0100',
            },
          ],
        },
      ],
    };
    expect(mapSleep(backwards)).toEqual({ events: [], skipped: 1 });
  });
});

describe('mapWeight', () => {
  it('makes a point with the quantity per sample', () => {
    expect(mapWeight(sample).events).toEqual([
      {
        externalId: 'weight_body_mass:2026-11-10T06:15:00.000Z',
        category: HealthCategory.Weight,
        text: 'Weight 72.4 kg',
        occurredAt: at('2026-11-10T06:15:00Z'),
        endsAt: null,
        quantity: 72.43,
        unit: 'kg',
      },
      expect.objectContaining({ text: 'Weight 72.1 kg', quantity: 72.1 }),
    ]);
  });

  it('keys a sample by its instant, whatever offset it was written with', () => {
    const weight = (date: string) =>
      mapWeight({ metrics: [{ name: 'weight_body_mass', units: 'kg', data: [{ date, qty: 72 }] }] })
        .events[0].externalId;
    expect(weight('2026-11-10 07:15:00 +0100')).toBe(weight('2026-11-10 06:15:00 +0000'));
  });
});

describe('mapWorkouts', () => {
  it('makes a span with the type and active energy, keyed by the workout id', () => {
    expect(mapWorkouts(sample)).toEqual({
      events: [
        {
          externalId: 'workout:550e8400-e29b-41d4-a716-446655440000',
          category: HealthCategory.Workout,
          text: 'Traditional Strength Training, 313 kcal',
          occurredAt: at('2026-11-10T17:00:00Z'),
          endsAt: at('2026-11-10T18:05:00Z'),
          quantity: 312.6,
          unit: 'kcal',
        },
      ],
      skipped: 0,
    });
  });

  it('keys a version 1 workout without an id by its start and end', () => {
    const v1 = {
      workouts: [
        {
          name: 'Running',
          start: '2026-11-10 07:00:00 +0100',
          end: '2026-11-10 07:30:00 +0100',
          activeEnergy: [{ qty: 10, units: 'kcal', date: '2026-11-10 07:01:00 +0100' }],
        },
      ],
    };
    expect(mapWorkouts(v1).events).toEqual([
      expect.objectContaining({
        externalId: 'workout:Running:2026-11-10T06:00:00.000Z/2026-11-10T06:30:00.000Z',
        text: 'Running',
        quantity: null,
        unit: null,
      }),
    ]);
  });

  it('keeps two version 1 workouts of different types over the same span apart', () => {
    const span = { start: '2026-11-10 07:00:00 +0100', end: '2026-11-10 07:30:00 +0100' };
    const ids = mapWorkouts({
      workouts: [
        { name: 'Running', ...span },
        { name: 'Cycling', ...span },
      ],
    }).events.map((event) => event.externalId);
    expect(new Set(ids).size).toBe(2);
  });

  it('counts a workout it cannot read as skipped', () => {
    const broken = { workouts: [{ name: 'Running', start: 'yesterday', end: 'today' }] };
    expect(mapWorkouts(broken)).toEqual({ events: [], skipped: 1 });
  });
});

describe('mapMedications', () => {
  it('makes a point per taken dose and ignores the rest', () => {
    expect(mapMedications(sample)).toEqual({
      events: [
        {
          externalId: 'medication:Creatine Monohydrate:2026-11-10T07:30:00.000Z',
          category: HealthCategory.Medication,
          text: 'Creatine, 5 g',
          occurredAt: at('2026-11-10T07:30:00Z'),
          endsAt: null,
          quantity: 5,
          unit: 'g',
        },
      ],
      skipped: 0,
    });
  });
});

describe('mapHealthData', () => {
  it('runs every mapper and leaves types without one alone', () => {
    const { events, skipped } = mapHealthData(sample);
    expect(events.map((event) => event.category)).toEqual([
      HealthCategory.Sleep,
      HealthCategory.Weight,
      HealthCategory.Weight,
      HealthCategory.Workout,
      HealthCategory.Medication,
    ]);
    expect(skipped).toBe(0);
  });

  it('maps nothing from an empty push', () => {
    expect(mapHealthData({})).toEqual({ events: [], skipped: 0 });
  });
});
