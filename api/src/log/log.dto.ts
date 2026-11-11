import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { parseOffsetIso } from '../calendar/zoned-time';

// An instant with an explicit offset ("2026-11-11T08:30:00+01:00" or "...Z"), so it never
// depends on the server's time zone.
const instant = z.iso.datetime({ offset: true }).transform(parseOffsetIso);

const eventText = z.string().trim().min(1).max(1000);
const categoryName = z.string().trim().min(1).max(50);

// A span ends no earlier than it starts; a point has no end.
export const isValidSpan = (occurredAt: Date, endsAt: Date | null | undefined) =>
  endsAt == null || endsAt >= occurredAt;
const SPAN_MESSAGE = 'endsAt must not be before occurredAt';

// One event from the confirm card. Its category is an existing one (`categoryId`), one of the
// note's `newCategories` (`newCategory`, by name), or none.
const NoteEvent = z
  .object({
    text: eventText,
    occurredAt: instant,
    endsAt: instant.nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    newCategory: categoryName.optional(),
    // Which draft prompt produced the event (#163); absent for events the user wrote.
    extractorVersion: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine((event) => isValidSpan(event.occurredAt, event.endsAt), {
    message: SPAN_MESSAGE,
    path: ['endsAt'],
  })
  .refine((event) => !(event.categoryId && event.newCategory), {
    message: 'give either categoryId or newCategory, not both',
    path: ['newCategory'],
  });

const NewCategory = z.object({
  name: categoryName,
  description: z.string().trim().max(500).nullable().optional(),
});

// A confirmed note: the raw text as typed, and what it was turned into.
export class NewNoteDto extends createZodDto(
  z
    .object({
      rawText: z.string().trim().min(1).max(5000),
      capturedAt: instant,
      events: z.array(NoteEvent).min(1).max(50),
      newCategories: z.array(NewCategory).max(50).default([]),
    })
    .superRefine((note, ctx) => {
      const proposed = note.newCategories.map((category) => category.name);
      const used = new Set(note.events.flatMap((event) => event.newCategory ?? []));
      proposed.forEach((name, i) => {
        if (proposed.indexOf(name) !== i) {
          ctx.addIssue({
            code: 'custom',
            message: `"${name}" is listed twice`,
            path: ['newCategories', i, 'name'],
          });
        }
        // A new category exists only once the user confirms an event in it.
        if (!used.has(name)) {
          ctx.addIssue({
            code: 'custom',
            message: `no event is in "${name}"`,
            path: ['newCategories', i, 'name'],
          });
        }
      });
      note.events.forEach((event, i) => {
        if (event.newCategory && !proposed.includes(event.newCategory)) {
          ctx.addIssue({
            code: 'custom',
            message: `"${event.newCategory}" is not in newCategories`,
            path: ['events', i, 'newCategory'],
          });
        }
      });
    }),
) {}

// Only what the user may edit. A changed span is checked against the stored event.
export class EventPatchDto extends createZodDto(
  z.object({
    text: eventText.optional(),
    occurredAt: instant.optional(),
    endsAt: instant.nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
  }),
) {}

// Half-open: events overlapping [from, to).
export class EventRangeDto extends createZodDto(
  z
    .object({ from: instant, to: instant })
    .refine((range) => range.to > range.from, { message: 'to must be after from', path: ['to'] }),
) {}
