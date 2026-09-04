// Not included by default even at target: esnext — opt-in only.
/// <reference lib="esnext.temporal" />

// Formats as a plain (no UTC offset) ISO date-time — the API interprets
// this as wall-clock time in the requesting user's own stored timezone
// (see api/src/calendar/zoned-time.ts:parseZonedIso), same convention
// chat's calendar tool calls already use.
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
