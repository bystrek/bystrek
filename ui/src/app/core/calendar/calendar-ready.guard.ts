import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CalendarSyncService, SyncStatus } from './calendar-sync.service';

// Calendar screens open only once the first download is done. Checked on every navigation,
// since the API can drop the copy and start over (for example on an expired sync token).
export const calendarReadyGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const sync = inject(CalendarSyncService);
  try {
    const progress = await sync.progress();
    if (!progress) return router.createUrlTree(['/connect']);
    return progress.status === SyncStatus.READY ? true : router.createUrlTree(['/sync']);
  } catch {
    // The sync screen shows the error and offers a retry.
    return router.createUrlTree(['/sync']);
  }
};
