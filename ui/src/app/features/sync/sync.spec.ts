import { SyncProgress, SyncStatus } from '../../core/calendar/calendar-sync.service';
import { SyncPercentPipe } from './sync';

const progress = (status: SyncStatus, fetched: number, total: number | null): SyncProgress => ({
  status,
  fetched,
  total,
  error: null,
});

describe('SyncPercentPipe', () => {
  const pipe = new SyncPercentPipe();

  it('is indeterminate until the server has listed the calendar', () => {
    expect(pipe.transform(null)).toBeUndefined();
    expect(pipe.transform(progress(SyncStatus.PENDING, 0, null))).toBeUndefined();
  });

  it('shows the share downloaded so far', () => {
    expect(pipe.transform(progress(SyncStatus.SYNCING, 50, 105))).toBe(48);
  });

  it('is full for an empty calendar and once ready', () => {
    expect(pipe.transform(progress(SyncStatus.SYNCING, 0, 0))).toBe(100);
    expect(pipe.transform(progress(SyncStatus.READY, 105, 105))).toBe(100);
  });
});
