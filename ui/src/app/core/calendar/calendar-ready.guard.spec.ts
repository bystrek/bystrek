import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { calendarReadyGuard } from './calendar-ready.guard';
import { CalendarSyncService, SyncProgress, SyncStatus } from './calendar-sync.service';

const run = (progress: () => Promise<SyncProgress | null>) => {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: CalendarSyncService, useValue: { progress } }],
  });
  return TestBed.runInInjectionContext(
    () => calendarReadyGuard({} as never, {} as never) as Promise<boolean | UrlTree>,
  );
};

const progress = (status: SyncStatus): SyncProgress => ({
  status,
  fetched: 0,
  total: null,
  error: null,
});

const url = (result: boolean | UrlTree) =>
  result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;

describe('calendarReadyGuard', () => {
  it('lets the agenda open once the first download is done', async () => {
    expect(url(await run(async () => progress(SyncStatus.READY)))).toBe(true);
  });

  it('sends a user with no calendar to the connect wizard', async () => {
    expect(url(await run(async () => null))).toBe('/connect');
  });

  it('sends a download in progress or failed to the sync screen', async () => {
    expect(url(await run(async () => progress(SyncStatus.SYNCING)))).toBe('/sync');
    TestBed.resetTestingModule();
    expect(url(await run(async () => progress(SyncStatus.ERROR)))).toBe('/sync');
  });

  it('sends an unreachable API to the sync screen, which offers a retry', async () => {
    expect(url(await run(() => Promise.reject(new Error('offline'))))).toBe('/sync');
  });
});
