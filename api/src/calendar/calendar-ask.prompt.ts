import { describeDates, nowLine } from './calendar-ask.dates';

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

export function buildUserMessage(
  question: string,
  now: Date,
  timezone: string,
  referenced: string[] = [],
): string {
  return [...describeDates(now, timezone, referenced), `Q: ${question}`].join('\n');
}

// First call: names explicit dates so the server can add them to the main query's Dates line.
// Kept separate from SYSTEM_PROMPT, which stays byte-identical for prefix caching.
export const DISCOVERY_PROMPT = `You find explicit calendar dates in a question. Reply with exactly one JSON object: {"dates":["YYYY-MM-DD"]}.
List a date only when the question names it by day of the month or by month and day, such as "the 10th", "Oct 10th" or "10 November". Use the Now line to choose the year and month: the next upcoming occurrence, unless the question clearly means another.
Weekday names, "today", "tomorrow", "this week" and "next week" are not explicit dates, so never list them. Reply {"dates":[]} when no explicit date is named.`;

export const DISCOVERY_FORMAT = {
  type: 'object',
  properties: {
    dates: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
  required: ['dates'],
};

export function buildDiscoveryMessage(question: string, now: Date, timezone: string): string {
  return [nowLine(now, timezone), `Q: ${question}`].join('\n');
}
