import { Inject, Injectable } from '@nestjs/common';
import { assertValidTimeZone } from '../calendar/zoned-time';
import { LLM_MODEL } from '../env';
import { LLM_CLIENT, type LlmClient } from '../llm/llm.client';
import { UsersService } from '../users/users.service';
import { DiaryCategoriesService } from './diary-categories.service';
import { buildDraft, type DiaryDraft } from './diary-draft.build';
import { parseReply } from './diary-draft.parse';
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from './diary-draft.prompt';
import { describeLocalTime } from './diary-draft.time';

// `draft` is confirmed, as edited, by POST /diary/notes.
export type DiaryDraftResponse =
  | ({ kind: 'draft' } & DiaryDraft)
  | { kind: 'nothing'; text: string }
  | { kind: 'text'; text: string };

export const NOTHING_TEXT = "I didn't find anything to log in that.";
export const FALLBACK_TEXT = "I couldn't work that out. Try rephrasing it.";

// Rewritten text is about as long as the note, plus per-event JSON: room for a 2000-character
// note split into a dozen events.
const MAX_REPLY_TOKENS = 2000;

// Which prompt and model drafted an event, stored with it for later re-extraction.
const EXTRACTOR_VERSION = `${PROMPT_VERSION}/${LLM_MODEL}`;

// One note in, one draft out. Stateless: nothing is stored until the user confirms, and
// refining means sending the edited note again. An LlmError passes through.
@Injectable()
export class DiaryDraftService {
  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly users: UsersService,
    private readonly categories: DiaryCategoriesService,
  ) {}

  async draft(userId: string, text: string, capturedAt: Date): Promise<DiaryDraftResponse> {
    const [timeZone, categories] = await Promise.all([
      this.users.timeZone(userId),
      this.categories.list(userId),
    ]);
    // A bad time zone comes from our own user record, not the model, so it throws.
    assertValidTimeZone(timeZone);

    const content = await this.llm.generateJson({
      system: SYSTEM_PROMPT,
      user: buildUserMessage({ now: describeLocalTime(capturedAt, timeZone), categories, text }),
      maxTokens: MAX_REPLY_TOKENS,
    });
    const events = parseReply(content);
    if (!events) return { kind: 'text', text: FALLBACK_TEXT };
    if (!events.length) return { kind: 'nothing', text: NOTHING_TEXT };

    const context = { capturedAt, timeZone, categories, extractorVersion: EXTRACTOR_VERSION };
    return { kind: 'draft', ...buildDraft(events, context) };
  }
}
