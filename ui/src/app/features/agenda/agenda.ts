import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AgendaStore } from './agenda-store';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { AskBar } from './ask-bar';
import { AskBarStore } from './ask-bar-store';
import { AgendaRow, AgendaRowKind, EventStatus } from './agenda-rows';
import { DurationPipe, MinutesUntilPipe, WeekdayAndDatePipe } from './agenda-pipes';

@Component({
  selector: 'app-agenda',
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
  providers: [AgendaStore, AskBarStore],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Agenda {
  protected readonly store = inject(AgendaStore);
  protected readonly askStore = inject(AskBarStore);
  protected readonly EventStatus = EventStatus;
  protected readonly AgendaRowKind = AgendaRowKind;

  trackRow(row: AgendaRow): string {
    return row.key;
  }
}
