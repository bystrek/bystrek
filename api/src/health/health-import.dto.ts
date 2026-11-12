import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { HealthData } from './health-mappers';

// A Health Auto Export push: `{ data: { metrics, workouts, medications, … } }`. Loose, so the
// body reaches the raw table as received.
export class HealthImportDto extends createZodDto(z.looseObject({ data: HealthData })) {}
