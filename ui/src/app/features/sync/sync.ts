import { ChangeDetectionStrategy, Component, Pipe, PipeTransform, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SyncProgress, SyncStatus } from '../../core/calendar/calendar-sync.service';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { Progress } from '../../shared/progress/progress';
import { SyncStore } from './sync-store';

/** 0-100 once the server has listed the calendar; undefined (indeterminate) before that. */
@Pipe({ name: 'syncPercent' })
export class SyncPercentPipe implements PipeTransform {
  transform(progress: SyncProgress | null): number | undefined {
    if (!progress?.total) return progress?.status === SyncStatus.READY ? 100 : undefined;
    return Math.round((progress.fetched / progress.total) * 100);
  }
}

@Pipe({ name: 'syncLabel' })
export class SyncLabelPipe implements PipeTransform {
  transform(progress: SyncProgress | null): string {
    if (progress?.total == null) return 'Connecting to your calendar…';
    return `Downloaded ${progress.fetched} of ${progress.total} events`;
  }
}

@Component({
  selector: 'app-sync',
  imports: [Alert, Button, Progress, RouterLink, SyncLabelPipe, SyncPercentPipe],
  providers: [SyncStore],
  templateUrl: './sync.html',
  styleUrl: './sync.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sync {
  protected readonly store = inject(SyncStore);
  protected readonly SyncStatus = SyncStatus;
}
