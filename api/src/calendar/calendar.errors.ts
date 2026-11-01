export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('no calendar connected — set it up on the profile page first');
  }
}

export class CalendarUrlMismatchError extends Error {
  constructor(configuredUrl: string, availableUrls: string[]) {
    super(
      `configured calendar (${configuredUrl}) no longer exists on this account ` +
        `(available: ${availableUrls.length ? availableUrls.join(', ') : 'none'}) — ` +
        `pick a calendar again on the profile page, or clear it to use the first calendar`,
    );
  }
}

export class CalendarEventNotFoundError extends Error {
  constructor(uid: string) {
    super(`no event found with uid "${uid}"`);
  }
}

// An update or delete raced a change made from another client.
export class CalendarChangedError extends Error {
  constructor() {
    super('the event changed in another app — reload and try again');
  }
}

export interface CalendarSyncProgress {
  status: 'pending' | 'syncing' | 'ready' | 'error';
  fetched: number;
  total: number | null;
  error: string | null;
}

// The local copy can't answer yet: the first download is running, or it failed.
export class CalendarNotReadyError extends Error {
  constructor(readonly progress: CalendarSyncProgress) {
    super(
      progress.status === 'error'
        ? `calendar sync failed: ${progress.error ?? 'unknown error'}`
        : 'your calendar is still syncing — this can take a minute',
    );
  }
}
