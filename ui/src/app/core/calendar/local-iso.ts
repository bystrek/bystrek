function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Formats as a plain (no UTC offset) ISO date-time — the API interprets
// this as wall-clock time in the requesting user's own stored timezone
// (see api/src/calendar/zoned-time.ts:parseZonedIso), same convention
// chat's calendar tool calls already use.
export function toLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
