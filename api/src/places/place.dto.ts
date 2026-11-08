import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OsmType } from '../geo/geocoder';
import { PlaceCategory } from './place-category';

// A blank optional field clears it.
const blankAsNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankAsNull, schema.nullable()).optional();

// What a user types or confirms. Unknown keys (e.g. client-sent `lat`/`lng`) are dropped:
// location fields only ever come from the geocoder.
const PlaceFields = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(PlaceCategory),
  address: z.string().trim().min(1).max(500),
  notes: optional(z.string().trim().max(2000)),
  url: optional(z.httpUrl().max(2000)),
});

// A confirmed draft plus the geocoder match the user chose.
export class NewPlaceDto extends createZodDto(
  PlaceFields.extend({
    osmType: z.enum(OsmType),
    osmId: z.number().int().positive(),
  }),
) {}

export class PlacePatchDto extends createZodDto(PlaceFields.partial()) {}
