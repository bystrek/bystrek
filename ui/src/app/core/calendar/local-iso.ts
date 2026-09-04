// Not included by default even at target: esnext — opt-in only.
/// <reference lib="esnext.temporal" />

// No UTC offset — the API reads this as wall-clock time in the user's own
// stored timezone (see zoned-time.ts:parseZonedIso).
export function toLocalIso(date: Date): string {
  return Temporal.PlainDateTime.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }).toString();
}
