import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EventInput } from './ical-event';

// Write safety (docs/architecture.md): sensitive writes need explicit
// confirmation, not silent auto-execution. Enforced here, not just
// suggested in a tool description — a mutating tool only ever stages an
// action; `take()` refuses to hand it back for execution unless the caller
// is a different chat request than the one that staged it, so a single
// hallucinated or prompt-injected reply can't propose-and-immediately-
// confirm its own destructive write in one turn. In-memory and short-lived
// (a few minutes) is enough for this: single instance, low volume, and a
// lost pending action on restart just means the user re-asks.
const TTL_MS = 10 * 60 * 1000;

export type PendingCalendarAction =
  | { kind: 'create'; input: EventInput }
  | { kind: 'update'; uid: string; input: Partial<EventInput> }
  | { kind: 'delete'; uid: string };

interface StagedAction {
  userId: string;
  requestId: string;
  expiresAt: number;
  action: PendingCalendarAction;
}

@Injectable()
export class PendingCalendarActions {
  private readonly staged = new Map<string, StagedAction>();

  stage(userId: string, requestId: string, action: PendingCalendarAction): string {
    this.sweep();
    const id = randomUUID();
    this.staged.set(id, { userId, requestId, expiresAt: Date.now() + TTL_MS, action });
    return id;
  }

  // Consumes the staged action (removes it either way — a failed confirm
  // attempt shouldn't be retryable, the model should propose again).
  // Returns null with no side effect beyond that if missing/expired/
  // mismatched-user/same-request, so callers can't distinguish "doesn't
  // exist" from "not allowed yet" — no information leak either way.
  take(id: string, userId: string, requestId: string): PendingCalendarAction | null {
    const staged = this.staged.get(id);
    if (!staged) return null;
    this.staged.delete(id);

    if (staged.userId !== userId) return null;
    if (staged.expiresAt < Date.now()) return null;
    if (staged.requestId === requestId) return null;
    return staged.action;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, staged] of this.staged) {
      if (staged.expiresAt < now) this.staged.delete(id);
    }
  }
}
