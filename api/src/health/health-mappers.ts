import { z } from 'zod';
import { isValidSpan } from '../diary/diary.dto';
import { healthDate, healthDay } from './health-date';

// The fixed category each mapper files its events under, created for the user on first import.
export const HealthCategory = {
  Sleep: 'Sleep',
  Workout: 'Workout',
  Weight: 'Weight',
  Medication: 'Medication',
} as const;
export type HealthCategory = (typeof HealthCategory)[keyof typeof HealthCategory];

// One diary event derived from a Health Auto Export push. `externalId` is stable across pushes,
// so a re-sent range updates the event instead of adding another.
export interface HealthEvent {
  externalId: string;
  category: HealthCategory;
  text: string;
  occurredAt: Date;
  endsAt: Date | null;
  quantity: number | null;
  unit: string | null;
}

// `skipped` counts entries of a mapped type that didn't parse; entries a mapper ignores on
// purpose (a skipped dose) aren't counted.
export interface Mapped {
  events: HealthEvent[];
  skipped: number;
}

// The parts of a push's `data` the mappers read. Everything else stays only in the raw payload.
export const HealthData = z.looseObject({
  metrics: z.array(z.unknown()).optional(),
  workouts: z.array(z.unknown()).optional(),
  medications: z.array(z.unknown()).optional(),
});
export type HealthData = z.infer<typeof HealthData>;

const Metric = z.object({ name: z.string(), units: z.string(), data: z.array(z.unknown()) });

const Quantity = z.object({ qty: z.number(), units: z.string() });

const round = (value: number, digits: number) => Number(value.toFixed(digits));

function mapEach<S extends z.ZodType>(
  entries: unknown[] | undefined,
  schema: S,
  toEvent: (entry: z.output<S>) => HealthEvent | null,
): Mapped {
  const mapped: Mapped = { events: [], skipped: 0 };
  for (const entry of entries ?? []) {
    const parsed = schema.safeParse(entry);
    const event = parsed.success ? toEvent(parsed.data) : null;
    if (!parsed.success || (event && !isValidSpan(event.occurredAt, event.endsAt))) {
      mapped.skipped++;
    } else if (event) {
      mapped.events.push(event);
    }
  }
  return mapped;
}

// The samples of one metric (`sleep_analysis`, `weight_body_mass`) and their unit.
function metric(data: HealthData, name: string) {
  for (const entry of data.metrics ?? []) {
    const parsed = Metric.safeParse(entry);
    if (parsed.success && parsed.data.name === name) return parsed.data;
  }
  return undefined;
}

// "7 h 12 min" for 7.2 hours.
function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// One span per night. Needs the automation's "Summarize Data" on; per-stage samples don't parse.
// Keyed by the night's date rather than its start and end: a push during the night sends a
// shorter night that the next push extends.
const SleepNight = z.object({
  date: healthDay,
  sleepStart: healthDate,
  sleepEnd: healthDate,
  totalSleep: z.number().optional(),
  asleep: z.number().optional(),
});

export function mapSleep(data: HealthData): Mapped {
  const sleep = metric(data, 'sleep_analysis');
  return mapEach(sleep?.data, SleepNight, (night) => {
    const asleep = night.totalSleep ?? night.asleep ?? null;
    return {
      externalId: `sleep_analysis:${night.date}`,
      category: HealthCategory.Sleep,
      text: asleep == null ? 'Sleep' : `Sleep, ${formatHours(asleep)}`,
      occurredAt: night.sleepStart,
      endsAt: night.sleepEnd,
      quantity: asleep,
      unit: asleep == null ? null : sleep!.units,
    };
  });
}

const WeightSample = z.object({ date: healthDate, qty: z.number() });

export function mapWeight(data: HealthData): Mapped {
  const weight = metric(data, 'weight_body_mass');
  return mapEach(weight?.data, WeightSample, (sample) => ({
    externalId: `weight_body_mass:${sample.date.toISOString()}`,
    category: HealthCategory.Weight,
    text: `Weight ${round(sample.qty, 1)} ${weight!.units}`,
    occurredAt: sample.date,
    endsAt: null,
    quantity: sample.qty,
    unit: weight!.units,
  }));
}

// Without an id (version 1), a workout is keyed by its type and span.
// Version 2 names it `activeEnergyBurned`, version 1 `activeEnergy`; either may be missing or,
// in older exports, a series, which counts as missing.
const Workout = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  start: healthDate,
  end: healthDate,
  activeEnergyBurned: Quantity.optional().catch(undefined),
  activeEnergy: Quantity.optional().catch(undefined),
});

export function mapWorkouts(data: HealthData): Mapped {
  return mapEach(data.workouts, Workout, (workout) => {
    const energy = workout.activeEnergyBurned ?? workout.activeEnergy;
    return {
      externalId: `workout:${workout.id ?? `${workout.name}:${workout.start.toISOString()}/${workout.end.toISOString()}`}`,
      category: HealthCategory.Workout,
      text: energy ? `${workout.name}, ${round(energy.qty, 0)} ${energy.units}` : workout.name,
      occurredAt: workout.start,
      endsAt: workout.end,
      quantity: energy?.qty ?? null,
      unit: energy?.units ?? null,
    };
  });
}

// ", 5 g" for a measured dose. A dose counted in units ("count": a pill, a capsule) shows only
// when it's more than one: "Vitamin D ×2".
function formatDose(dosage: number | undefined, units: string | undefined): string {
  if (dosage == null) return '';
  if (units === 'count') return dosage === 1 ? '' : ` ×${dosage}`;
  return units ? `, ${dosage} ${units}` : `, ${dosage}`;
}

// iOS 26 Medications log. Only doses marked taken become events.
const Dose = z.object({
  displayText: z.string().trim().min(1),
  nickname: z.string().trim().min(1).optional(),
  start: healthDate,
  status: z.string(),
  dosage: z.number().optional(),
  units: z.string().optional(),
});

export function mapMedications(data: HealthData): Mapped {
  return mapEach(data.medications, Dose, (dose) => {
    if (dose.status !== 'Taken') return null;
    return {
      externalId: `medication:${dose.displayText}:${dose.start.toISOString()}`,
      category: HealthCategory.Medication,
      text: `${dose.nickname ?? dose.displayText}${formatDose(dose.dosage, dose.units)}`,
      occurredAt: dose.start,
      endsAt: null,
      quantity: dose.dosage ?? null,
      unit: dose.dosage == null ? null : (dose.units ?? null),
    };
  });
}

const mappers = [mapSleep, mapWeight, mapWorkouts, mapMedications];

// Every event the push's mapped types yield. Types without a mapper are left alone.
export function mapHealthData(data: HealthData): Mapped {
  const results = mappers.map((map) => map(data));
  return {
    events: results.flatMap((result) => result.events),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
  };
}
