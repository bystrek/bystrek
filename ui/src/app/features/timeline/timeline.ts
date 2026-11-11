import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TimelineStore } from './timeline-store';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { AskBar } from './ask-bar';
import { AskBarStore } from './ask-bar-store';
import { TimelineRow, TimelineRowKind, EventStatus } from './timeline-rows';
import { DurationPipe, MinutesUntilPipe, WeekdayAndDatePipe } from './timeline-pipes';

@Component({
  selector: 'app-timeline',
  imports: [
    AskBar,
    Button,
    DurationPipe,
    Icon,
    MinutesUntilPipe,
    Progress,
    Tag,
    WeekdayAndDatePipe,
  ],
  providers: [TimelineStore, AskBarStore],
  templateUrl: './timeline.html',
  styleUrl: './timeline.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timeline {
  protected readonly store = inject(TimelineStore);
  protected readonly askStore = inject(AskBarStore);
  protected readonly EventStatus = EventStatus;
  protected readonly TimelineRowKind = TimelineRowKind;

  trackRow(row: TimelineRow): string {
    return row.key;
  }
}
