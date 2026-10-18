# ADR 0001: Calendar command contract and local-date rules

Status: accepted. Scope: read and draft actions for calendar (#80, #81, #82).

## Local dates and times

- The model emits either a relative day token (`today`, `tomorrow`, `yesterday`) or an explicit `YYYY-MM-DD`, plus `HH:mm` for times.
- The backend resolves all of these in `users.timezone`, using the server clock as "now". The browser's timezone is never used.
- A day spans account-local midnight to the next account-local midnight.
- On `create_event`, missing `end` means start + 60 minutes as an instant. `endDay` is then the local date of that end, so 23:30 resolves to 00:30 on the next day.
- On `create_event` with an explicit `end`, `endDay` defaults to `day`. If the resolved end is not after the start, the request returns `invalid_range`. Overnight events with an explicit `end` (for example 23:30–00:30) set `endDay`.
- Event times in results and previews are RFC 3339 with offset (`2026-10-25T02:30:00+01:00`). The offset tells the two fall-back occurrences apart.
- Ambiguous local times (DST fall-back) return `needs_choice`. Its options are the two resolved RFC 3339 instants. The backend never picks silently.
- Nonexistent local times (DST spring-forward gap) and malformed `HH:mm` return `invalid_time`. The backend does not shift them; the model asks the user for another time.
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
  start: string; // RFC 3339 with offset
  end: string; // RFC 3339 with offset
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
- Targets are never free text. The model picks an `EventTarget` from an `answer` of `list_events`. If several events match, the model asks the user which one before drafting. The backend does not resolve targets.
- On `update_event`, omitted fields keep their current values. Setting any of `day`, `start`, `end`, or `endDay` recomputes start and end from the set values and the event's current values for the rest.
- `shift_events` and undo are not part of this contract.

## Results and statuses

```ts
type Result =
  | { status: 'answer'; events: EventView[] }
  | { status: 'needs_input'; pending_id: string; missing: string[] }
  | { status: 'needs_choice'; pending_id: string; options: ChoiceOption[] }
  | { status: 'preview'; pending_id: string; kind: DraftAction['kind']; event: Omit<EventView, 'eventId' | 'version'> }
  | { status: 'applied'; kind: DraftAction['kind']; eventId: string }
  | { status: 'error'; code: ErrorCode; message: string };
```

`ErrorCode` is one of the codes in Errors.

| Status | Meaning | Next allowed |
| --- | --- | --- |
| `answer` | Read result from the backend | terminal |
| `needs_input` | Missing fields listed in `missing` | client resends `POST /calendar/drafts` with `pending_id` and the added fields |
| `needs_choice` | Ambiguous local time (fall-back overlap) | client calls `/choose` |
| `preview` | Resolved write with exact absolute times in `event` | client calls `/confirm` |
| `applied` | Write committed | terminal |
| `error` | Request failed | terminal |

- Only `preview` can precede `applied`.
- No Result contains an undo token.

## Endpoints

- `POST /calendar/read`: body `ReadAction`. Returns `answer` or `error`.
- `POST /calendar/drafts`: body `DraftAction` plus optional `pending_id`. Returns `needs_input`, `needs_choice`, `preview`, or `error`. With `pending_id`, the request's fields merge into the open draft: set fields overwrite, omitted fields keep the draft's values. A different `kind` or `target` returns `draft_mismatch`.
- `POST /calendar/drafts/:pending_id/choose`: body `{ optionId: string }`, matching one `ChoiceOption` on the draft. Returns `preview` or `error`. Never applies a write.
- `POST /calendar/drafts/:pending_id/confirm`: body empty. Claims and applies the draft (see lifecycle). Returns `applied` or `error`.

## `pending_id` lifecycle

- Created with a `needs_input`, `needs_choice`, or `preview` result.
- Held in server memory, per instance. A restart drops all drafts; the client gets `draft_expired`.
- The client echoes it to continue the same draft. A new request without it starts a new draft.
- Bound to the user. Expires 10 minutes after creation or last use.
- Confirm atomically claims the draft: the first confirm moves it from `open` to `claimed`. Any later confirm returns the stored outcome, or `draft_expired` while the first is still in flight. Unknown ids return `draft_expired`.
- For `update_event` and `delete_event`, confirm sends `expectedVersion` as a precondition on the write. A mismatch returns `stale_target` and writes nothing. A backend that cannot enforce this precondition does not offer update or delete.
- A claimed draft is never re-run. Any failure after the claim is final, including upstream timeouts with an unknown write outcome (`write_outcome_unknown`). The user creates a new draft to try again, after checking the calendar.

## Errors

| Code | When |
| --- | --- |
| `recurring_not_supported` | Target is a recurring event |
| `invalid_date` | Unparseable or nonexistent date |
| `invalid_time` | Malformed `HH:mm`, or a local time in a DST spring-forward gap |
| `ambiguous_date` | Read bound falls in a DST fall-back overlap. Read has no `needs_choice`, so it errors |
| `invalid_range` | Start not before end, or range invalid |
| `invalid_choice` | `optionId` is not on this draft |
| `draft_mismatch` | Continuation changes `kind` or `target` of an open draft |
| `draft_expired` | `pending_id` unknown, expired, or already claimed while in flight |
| `stale_target` | `expectedVersion` no longer matches the event |
| `upstream_failed` | Calendar write failed before any write was made |
| `write_outcome_unknown` | Upstream failed after the write may have happened. Draft is final; check the calendar |

## Invariants

- The model has no write tools. It emits draft actions only.
- No choice, clarification, or model output can apply a write. Only the user's confirm request writes.
- Every `preview` includes the resolved absolute date and times.
- Confirm is at-most-once per draft. A repeated or concurrent confirm never writes twice.
- Update and delete writes check `expectedVersion` at confirm time, not only at preview.
- Timezone comes from the account, never the browser.
- Event data in results comes from the backend, never from model output.
