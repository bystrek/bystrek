/// <reference lib="esnext.temporal" />
import { z } from 'zod';
import { parseOffsetIso } from '../calendar/zoned-time';

// Health Auto Export's timestamp format, `yyyy-MM-dd HH:mm:ss Z`: "2024-02-06 14:30:00 -0800".
const HEALTH_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/;

// The instant a Health Auto Export timestamp denotes and the calendar day it's on as the phone
// saw it, or a zod issue for anything else, impossible dates included.
const healthTimestamp = z.string().transform((value, ctx) => {
  const match = HEALTH_DATE.exec(value);
  if (match) {
    const [, day, time, hours, minutes] = match;
    try {
      return { instant: parseOffsetIso(`${day}T${time}${hours}:${minutes}`), day };
    } catch {
      // Falls through to the issue below.
    }
  }
  ctx.addIssue({ code: 'custom', message: `invalid date: ${value}` });
  return z.NEVER;
});

export const healthDate = healthTimestamp.transform((timestamp) => timestamp.instant);

// "2024-02-06" for "2024-02-06 00:00:00 +0100", whatever the offset.
export const healthDay = healthTimestamp.transform((timestamp) => timestamp.day);
