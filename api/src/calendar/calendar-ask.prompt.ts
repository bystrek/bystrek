import { formatZonedIso, upcomingDays, weekBoundsAround, weekdayName } from './zoned-time';

// Days listed in the user message so the model can map weekday names to dates.
export const DATES_AHEAD = 14;

// Byte-identical on every call so the Ollama prompt prefix stays cached.
export const SYSTEM_PROMPT = `You turn a question about the user's calendar into one JSON query. You never see the events; the server runs your query. Reply with exactly one JSON object and nothing else.

Shapes:
{"kind":"event","pick":"first"|"last"|"next","from":"<dt>","to":"<dt>"} - one specific event ("first event tomorrow", "my next meeting")
{"kind":"availability","from":"<dt>","to":"<dt>"} - free/busy questions
{"kind":"count","from":"<dt>","to":"<dt>"} - how many events
{"kind":"list","from":"<dt>","to":"<dt>"} - which events, what's on, or show the agenda. Use this for any question about several events or a whole day or week, never "event"
{"kind":"cant_do","text":"I can only read your calendar."} - any request to create, move, change, rename or delete

<dt> is local time without offset: YYYY-MM-DDTHH:MM.
Copy dates from the Dates line of the question. A weekday name means its date on the Weekdays line. A day of the month ("the 10th", "Oct 10th") means the entry with that date. Weeks run Monday to Sunday.
"to" is exclusive: it is the next midnight after the last day, written as 00:00 of the following date. Whole day = 00:00 of that day to 00:00 of the next day. Morning = 06:00-12:00, afternoon = 12:00-18:00, evening = 18:00 to 00:00 of the next day. A single time ("at 3pm") = that time to one hour later. "Next" event: from = Now, to = 00:00 of the day after the last listed date.

Examples (for a different date; use the real Dates line):
Now: Mon 2026-03-02 09:00
Dates: Mon 2026-03-02 (today), Tue 2026-03-03, Wed 2026-03-04, Thu 2026-03-05, Fri 2026-03-06, Sat 2026-03-07, Sun 2026-03-08, Mon 2026-03-09, Tue 2026-03-10, Wed 2026-03-11, Thu 2026-03-12, Fri 2026-03-13, Sat 2026-03-14, Sun 2026-03-15
Next week: Mon 2026-03-09 to Sun 2026-03-15
Q: when is my first event tomorrow?
A: {"kind":"event","pick":"first","from":"2026-03-03T00:00","to":"2026-03-04T00:00"}
Q: am I free friday afternoon?
A: {"kind":"availability","from":"2026-03-06T12:00","to":"2026-03-06T18:00"}
Q: how many meetings next week?
A: {"kind":"count","from":"2026-03-09T00:00","to":"2026-03-16T00:00"}
Q: what events do I have on Tuesday?
A: {"kind":"list","from":"2026-03-03T00:00","to":"2026-03-04T00:00"}
Q: what is on the 10th?
A: {"kind":"list","from":"2026-03-10T00:00","to":"2026-03-11T00:00"}
Q: what's my next event?
A: {"kind":"event","pick":"next","from":"2026-03-02T09:00","to":"2026-03-16T00:00"}
Q: move my standup to 3pm
A: {"kind":"cant_do","text":"I can only read your calendar."}`;

// Ollama `format` schema: guarantees valid JSON; field-level rules are checked in parseQuery.
export const QUERY_FORMAT = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['event', 'availability', 'count', 'list', 'cant_do'] },
    pick: { type: 'string', enum: ['first', 'last', 'next'] },
    from: { type: 'string' },
    to: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['kind'],
};

export function buildUserMessage(question: string, now: Date, timezone: string): string {
  const week = weekBoundsAround(now, timezone);
  const nowLabel = formatZonedIso(now, timezone).slice(0, 16).replace('T', ' ');
  return [
    `Now: ${weekdayName(now, timezone).slice(0, 3)} ${nowLabel}`,
    `Dates: ${shortDates(now, timezone).join(', ')}`,
    `Weekdays: ${nextWeekdays(now, timezone).join(', ')}`,
    `This week: ${week.thisWeekStart} to ${week.thisWeekEnd}. Next week: ${week.nextWeekStart} to ${week.nextWeekEnd}.`,
    `Q: ${question}`,
  ].join('\n');
}

function shortDates(now: Date, timezone: string): string[] {
  return upcomingDays(now, timezone, DATES_AHEAD).map((entry) => {
    const weekday = entry.slice(0, 3);
    return `${weekday} ${entry.slice(entry.indexOf(' ') + 1)}`;
  });
}

// The next occurrence of each weekday, so a bare weekday name maps to one date.
function nextWeekdays(now: Date, timezone: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const entry of upcomingDays(now, timezone, DATES_AHEAD)) {
    const weekday = entry.slice(0, 3);
    if (seen.has(weekday)) continue;
    seen.add(weekday);
    found.push(`${weekday}=${entry.match(/\d{4}-\d{2}-\d{2}/)?.[0]}`);
  }
  return found;
}
