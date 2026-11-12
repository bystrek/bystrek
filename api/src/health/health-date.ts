/// <reference lib="esnext.temporal" />
import { z } from 'zod';
import { parseOffsetIso } from '../calendar/zoned-time';

// Health Auto Export's timestamp format, `yyyy-MM-dd HH:mm:ss Z`: "2024-02-06 14:30:00 -0800".
const HEALTH_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/;

// The instant a Health Auto Export timestamp denotes, or a zod issue for anything else.
export const healthDate = z
  .string()
  .regex(HEALTH_DATE)
  .transform((value, ctx) => {
    const [, date, time, hours, minutes] = HEALTH_DATE.exec(value)!;
    try {
      return parseOffsetIso(`${date}T${time}${hours}:${minutes}`);
    } catch {
      ctx.addIssue({ code: 'custom', message: `invalid date: ${value}` });
      return z.NEVER;
    }
  });

// The calendar day a Health Auto Export timestamp is on, as the phone saw it: "2024-02-06".
export const healthDay = z
  .string()
  .regex(HEALTH_DATE)
  .transform((value) => HEALTH_DATE.exec(value)![1]);
