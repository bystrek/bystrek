import { describe, expect, it } from 'bun:test';
import { healthAutoExportSample } from '../../test/fixtures/health-auto-export.sample';
import {
  HealthCategory,
  type HealthData,
  mapBodyFat,
  mapHealthData,
  mapMedications,
  mapSleep,
  mapWeight,
  mapWorkouts,
} from './health-mappers';

// A real, scrubbed export (see the fixture's header).
const sample: HealthData = healthAutoExportSample.data;
const at = (iso: string) => new Date(iso);

describe('mapSleep', () => {
  it('makes one span per night from the summarised export, keyed by its date', () => {
    expect(mapSleep(sample)).toEqual({
      events: [
        {
          externalId: 'sleep_analysis:2025-11-11',
          category: HealthCategory.Sleep,
          text: 'Sleep, 7 h 43 min',
          occurredAt: at('2025-11-10T23:20:16Z'),
          endsAt: at('2025-11-11T07:38:31Z'),
          quantity: 7.723978107670943,
          unit: 'hr',
        },
        expect.objectContaining({
          externalId: 'sleep_analysis:2025-11-12',
          text: 'Sleep, 8 h 13 min',
        }),
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

// The recorded export has no weigh-ins, so these use the shape of the export's other metrics.
describe('mapWeight', () => {
  const weighIns = (...data: { date: string; qty: number }[]) => ({
    metrics: [{ name: 'weight_body_mass', units: 'kg', data }],
  });

  it('makes a point with the quantity per sample', () => {
    expect(mapWeight(weighIns({ date: '2026-11-10 07:15:00 +0100', qty: 72.43 }))).toEqual({
      events: [
        {
          externalId: 'weight_body_mass:2026-11-10T06:15:00.000Z',
          category: HealthCategory.Body,
          text: 'Weight 72.4 kg',
          occurredAt: at('2026-11-10T06:15:00Z'),
          endsAt: null,
          quantity: 72.43,
          unit: 'kg',
        },
      ],
      skipped: 0,
    });
  });

  it('keys a sample by its instant, whatever offset it was written with', () => {
    const id = (date: string) => mapWeight(weighIns({ date, qty: 72 })).events[0].externalId;
    expect(id('2026-11-10 07:15:00 +0100')).toBe(id('2026-11-10 06:15:00 +0000'));
  });
});

describe('mapBodyFat', () => {
  it('makes a point with the percentage per sample', () => {
    const bodyFat = {
      metrics: [
        {
          name: 'body_fat_percentage',
          units: '%',
          data: [{ date: '2026-11-10 07:15:00 +0100', qty: 18.24 }],
        },
      ],
    };
    expect(mapBodyFat(bodyFat).events).toEqual([
      {
        externalId: 'body_fat_percentage:2026-11-10T06:15:00.000Z',
        category: HealthCategory.Body,
        text: 'Body fat 18.2 %',
        occurredAt: at('2026-11-10T06:15:00Z'),
        endsAt: null,
        quantity: 18.24,
        unit: '%',
      },
    ]);
  });
});

describe('mapWorkouts', () => {
  it('makes a span with the type and active energy, keyed by the workout id', () => {
    expect(mapWorkouts(sample)).toEqual({
      events: [
        {
          externalId: 'workout:AD309928-5DE8-43D4-8394-8192428CBDF6',
          category: HealthCategory.Workout,
          text: 'Traditional Strength Training, 315 kcal',
          occurredAt: at('2025-11-10T06:58:18Z'),
          endsAt: at('2025-11-10T08:03:03Z'),
          quantity: 314.84300000000155,
          unit: 'kcal',
        },
        expect.objectContaining({
          externalId: 'workout:F3211E05-B23B-459F-80C8-A24BE1BA16F6',
          text: 'Outdoor Cycling, 48 kcal',
        }),
      ],
      skipped: 0,
    });
  });

  it('keys a version 1 workout without an id by its type and span', () => {
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
  it('makes a point per taken dose, with or without a dosage, and ignores the rest', () => {
    expect(mapMedications(sample)).toEqual({
      events: [
        {
          externalId: 'medication:suplementy:2025-10-31T23:05:05.000Z',
          category: HealthCategory.Medication,
          text: 'suplementy',
          occurredAt: at('2025-10-31T23:05:05Z'),
          endsAt: null,
          quantity: 1,
          unit: 'count',
        },
        {
          externalId: 'medication:suplementy:2025-11-01T23:32:36.000Z',
          category: HealthCategory.Medication,
          text: 'suplementy',
          occurredAt: at('2025-11-01T23:32:36Z'),
          endsAt: null,
          quantity: null,
          unit: null,
        },
      ],
      skipped: 0,
    });
  });

  it('shows a measured dose with its unit and a counted one only above one', () => {
    const dose = (dosage: number, units: string, nickname?: string) => ({
      displayText: 'Creatine Monohydrate',
      nickname,
      start: '2026-11-10 08:30:00 +0100',
      status: 'Taken',
      dosage,
      units,
    });
    const texts = mapMedications({
      medications: [dose(5, 'g', 'Creatine'), dose(2, 'count')],
    }).events.map((event) => event.text);
    expect(texts).toEqual(['Creatine, 5 g', 'Creatine Monohydrate ×2']);
  });
});

describe('mapHealthData', () => {
  it('runs every mapper and leaves types without one alone', () => {
    const { events, skipped } = mapHealthData(sample);
    expect(events.map((event) => event.category)).toEqual([
      HealthCategory.Sleep,
      HealthCategory.Sleep,
      HealthCategory.Workout,
      HealthCategory.Workout,
      HealthCategory.Medication,
      HealthCategory.Medication,
    ]);
    expect(skipped).toBe(0);
  });

  it('maps nothing from an empty push', () => {
    expect(mapHealthData({})).toEqual({ events: [], skipped: 0 });
  });
});
