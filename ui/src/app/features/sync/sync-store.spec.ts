import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  CalendarSyncService,
  SyncProgress,
  SyncStatus,
} from '../../core/calendar/calendar-sync.service';
import { POLL_INTERVAL_MS, SyncStore } from './sync-store';

const progress = (status: SyncStatus, fetched = 0, total: number | null = null): SyncProgress => ({
  status,
  fetched,
  total,
  error: status === SyncStatus.ERROR ? 'HTTP 500' : null,
});

const setup = (answers: (SyncProgress | null | Error)[], retry = vi.fn()) => {
  const calls = { count: 0 };
  const progressFn = vi.fn(async () => {
    const answer = answers[Math.min(calls.count++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const navigateByUrl = vi.fn(async () => true);
  TestBed.configureTestingModule({
    providers: [
      SyncStore,
      { provide: CalendarSyncService, useValue: { progress: progressFn, retry } },
      { provide: Router, useValue: { navigateByUrl } },
    ],
  });
  const store = TestBed.inject(SyncStore);
  return { store, progressFn, navigateByUrl, retry };
};

const tick = () => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

describe('SyncStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls until ready, then opens the timeline and stops', async () => {
    const { store, progressFn, navigateByUrl } = setup([
      progress(SyncStatus.PENDING),
      progress(SyncStatus.SYNCING, 50, 105),
      progress(SyncStatus.READY, 105, 105),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.progress()?.status).toBe(SyncStatus.PENDING);

    await tick();
    expect(store.progress()?.fetched).toBe(50);

    await tick();
    expect(navigateByUrl).toHaveBeenCalledWith('/timeline');

    await tick();
    await tick();
    expect(progressFn).toHaveBeenCalledTimes(3);
  });

  it('stops polling on a failed download and restarts it on retry', async () => {
    const retry = vi.fn(async () => progress(SyncStatus.PENDING));
    const { store, progressFn } = setup(
      [progress(SyncStatus.ERROR), progress(SyncStatus.SYNCING, 1, 2)],
      retry,
    );
    await vi.advanceTimersByTimeAsync(0);
    await tick();
    expect(store.progress()?.status).toBe(SyncStatus.ERROR);
    expect(progressFn).toHaveBeenCalledTimes(1);

    await store.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(store.progress()?.status).toBe(SyncStatus.SYNCING);
  });

  it('sends a user with no calendar to the connect wizard', async () => {
    const { navigateByUrl, progressFn } = setup([null]);
    await vi.advanceTimersByTimeAsync(0);
    await tick();
    expect(navigateByUrl).toHaveBeenCalledWith('/connect');
    expect(progressFn).toHaveBeenCalledTimes(1);
  });

  it('shows an unreachable API and polls again on retry without restarting the download', async () => {
    const retry = vi.fn();
    const { store } = setup([new Error('offline'), progress(SyncStatus.SYNCING, 1, 2)], retry);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.requestError()).toBe('offline');

    await store.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(retry).not.toHaveBeenCalled();
    expect(store.requestError()).toBeNull();
    expect(store.progress()?.status).toBe(SyncStatus.SYNCING);
  });
});
