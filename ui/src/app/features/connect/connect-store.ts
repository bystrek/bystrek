import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { CalendarOption, CalendarService } from '../../core/calendar/calendar.service';

export const ConnectStep = {
  PROVIDER: 'provider',
  CREDENTIALS: 'credentials',
  CALENDAR: 'calendar',
} as const;

export type ConnectStep = (typeof ConnectStep)[keyof typeof ConnectStep];

export const Provider = {
  ICLOUD: 'icloud',
  OTHER: 'other',
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

export const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';

export type ConnectCredentials = { caldavUrl: string; username: string; password: string };

type ConnectState = {
  step: ConnectStep;
  provider: Provider;
  calendars: CalendarOption[];
  busy: boolean;
  error: string | null;
};

// The connect wizard's steps. The form values live in the component; each step takes them in.
export const ConnectStore = signalStore(
  withState<ConnectState>({
    step: ConnectStep.PROVIDER,
    provider: Provider.ICLOUD,
    calendars: [],
    busy: false,
    error: null,
  }),
  withMethods((store) => {
    const calendar = inject(CalendarService);
    const router = inject(Router);

    const run = async (work: () => Promise<void>): Promise<void> => {
      patchState(store, { busy: true, error: null });
      try {
        await work();
      } catch (err) {
        patchState(store, { error: err instanceof Error ? err.message : String(err) });
      } finally {
        patchState(store, { busy: false });
      }
    };

    return {
      chooseProvider: (provider: Provider): void =>
        patchState(store, { provider, step: ConnectStep.CREDENTIALS, error: null }),

      back: (): void =>
        patchState(store, {
          step:
            store.step() === ConnectStep.CALENDAR ? ConnectStep.CREDENTIALS : ConnectStep.PROVIDER,
          error: null,
        }),

      // Doubles as the credentials check: a wrong password fails here, before anything is saved.
      loadCalendars: (credentials: ConnectCredentials): Promise<void> =>
        run(async () => {
          const calendars = await calendar.previewCalendars(credentials);
          if (calendars.length === 0) throw new Error('This account has no calendars.');
          patchState(store, { calendars, step: ConnectStep.CALENDAR });
        }),

      // Saving starts a fresh download when the account or calendar changed; the sync
      // screen shows it, or moves straight on when the copy is still current.
      connect: (credentials: ConnectCredentials, calendarUrl: string): Promise<void> =>
        run(async () => {
          const selected = store.calendars().find((option) => option.url === calendarUrl);
          if (!selected) throw new Error('Pick a calendar.');
          await calendar.save({
            ...credentials,
            calendarUrl: selected.url,
            calendarDisplayName: selected.displayName,
          });
          await router.navigateByUrl('/sync');
        }),
    };
  }),
);
