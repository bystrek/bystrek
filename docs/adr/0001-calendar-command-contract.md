# ADR 0001: Calendar command contract and local-date rules

Status: accepted. Scope: read and draft actions for calendar (#80, #81, #82).

## Local dates and times

- The model emits either a relative day token (`today`, `tomorrow`, `yesterday`) or an explicit `YYYY-MM-DD`, plus `HH:mm` for times.
- The backend resolves all of these in `users.timezone`, using the server clock as "now". The browser's timezone is never used.
- A day spans account-local midnight to the next account-local midnight.
- Missing `end` means start + 60 minutes, which may cross midnight.
- `endDay` defaults to `day`. If the resolved end is not after the start and `endDay` is unset, the request returns `invalid_range`. Overnight events (for example 23:30–00:30) set `endDay`.
- Ambiguous local times (DST fall-back) and nonexistent local times (DST spring-forward) return `needs_choice` with concrete options. The backend never picks silently.
- Unparseable or nonexistent dates return `invalid_date`. A range whose start is not before its end returns `invalid_range`.

## Actions

```ts
type DayRef = { token: 'today' | 'tomorrow' | 'yesterday' } | { date: string }; // date: YYYY-MM-DD
type TimeRef = { hhmm: string }; // HH:mm, account-local

type ReadAction = {
  kind: 'list_events';
  range: { day: DayRef } | { start: DayRef; end: DayRef }; // end exclusive
};

// Returned by `answer`. `version` is an opaque backend value (ETag).
type EventView = {
  eventId: string;
  version: string;
  summary: string;
  start: string; // absolute, account-local
  end: string; // absolute, account-local
  description?: string;
  location?: string;
};

type EventTarget = { eventId: string; expectedVersion: string }; // copied unchanged from EventView

type EventFields = {
  summary?: string;
  day?: DayRef;
  start?: TimeRef;
  end?: TimeRef;
  endDay?: DayRef; // defaults to `day`; set for overnight events
  description?: string;
  location?: string;
};

type ChoiceOption = { optionId: string; label: string }; // built by the backend only

type DraftAction =
  | { kind: 'create_event'; fields: EventFields } // summary, day, start required
  | { kind: 'update_event'; target: EventTarget; fields: EventFields }
  | { kind: 'delete_event'; target: EventTarget }; // cancel means delete
```

- `update_event` and `delete_event` require a target. A recurring target returns `recurring_not_supported`.
- `shift_events` and undo are not part of this contract.

## Results and statuses

| Status | Meaning | Next allowed |
| --- | --- | --- |
| `answer` | Read result with `EventView[]` from the backend | terminal |
| `needs_input` | Missing fields. Carries `pending_id` | client resends with `pending_id` and the added fields |
| `needs_choice` | Ambiguous time or target. Carries `options: ChoiceOption[]` and `pending_id` | client calls `/choose` |
| `preview` | Resolved write with exact absolute date and times. Carries `pending_id` | client calls `/confirm` |
| `applied` | Write committed | terminal |
| `error` | Request failed. Carries an error code | terminal |

- Only `preview` can precede `applied`.
- No Result contains an undo token.

## Endpoints

- `POST /calendar/read`: body `ReadAction`. Returns `answer` or `error`.
- `POST /calendar/drafts`: body `DraftAction`. Returns `needs_input`, `needs_choice`, or `preview`.
- `POST /calendar/drafts/:pending_id/choose`: body `{ optionId: string }`, matching one `ChoiceOption` on the draft. Returns `preview` only. Never applies a write.
- `POST /calendar/drafts/:pending_id/confirm`: body empty. Claims and applies the draft (see lifecycle). Returns `applied` or `error`.

## `pending_id` lifecycle

- Created with a `needs_input`, `needs_choice`, or `preview` result.
- Held in server memory, per instance. A restart drops all drafts; the client gets `draft_expired`.
- The client echoes it to continue the same draft. A new request without it starts a new draft.
- Bound to the user. Expires 10 minutes after creation or last use.
- Confirm atomically claims the draft: the first confirm moves it from `open` to `claimed`. Any later confirm returns the stored outcome, or `draft_expired` while the first is still in flight. Unknown ids return `draft_expired`.
- A claimed draft is never re-run. Any failure after the claim is final, including upstream timeouts with an unknown write outcome (`write_outcome_unknown`). The user creates a new draft to try again, after checking the calendar.

## Errors

| Code | When |
| --- | --- |
| `recurring_not_supported` | Target is a recurring event |
| `invalid_date` | Unparseable or nonexistent date |
| `ambiguous_date` | Read bound falls in a DST fall-back overlap. Read has no `needs_choice`, so it errors |
| `invalid_range` | Start not before end, or range invalid |
| `invalid_choice` | `optionId` is not on this draft |
| `draft_expired` | `pending_id` unknown, expired, or already claimed while in flight |
| `stale_target` | `expectedVersion` no longer matches the event |
| `upstream_failed` | Calendar write failed before any write was made |
| `write_outcome_unknown` | Upstream failed after the write may have happened. Draft is final; check the calendar |

## Invariants

- The model has no write tools. It emits draft actions only.
- No choice, clarification, or model output can apply a write. Only the user's confirm request writes.
- Every `preview` includes the resolved absolute date and times.
- Confirm is at-most-once per draft. A repeated or concurrent confirm never writes twice.
- Timezone comes from the account, never the browser.
- Event data in results comes from the backend, never from model output.
