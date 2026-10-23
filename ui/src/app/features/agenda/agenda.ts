import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CalendarEvent, CalendarService } from '../../core/calendar/calendar.service';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { AskBar } from './ask-bar';
import {
  AgendaRow,
  buildAgendaRows,
  dateKey,
  dayBounds,
  formatDayLabel,
  formatDuration,
  minutesUntil,
  shiftDay,
} from './agenda-model';

@Component({
  selector: 'app-agenda',
  imports: [AskBar, Button, Icon, Progress, Tag],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Agenda {
  private readonly calendar = inject(CalendarService);
  private requestId = 0;

  readonly now = signal(new Date());
  readonly selectedDay = signal(dateKey(new Date()));
  readonly rows = signal<AgendaRow[]>([]);
  readonly eventCount = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly askBusy = signal(false);
  private events: CalendarEvent[] = [];

  readonly dayLabel = computed(() => formatDayLabel(this.selectedDay()));
  readonly isToday = computed(() => this.selectedDay() === dateKey(this.now()));
  readonly subtitle = computed(() => {
    const count = this.eventCount();
    const label = count === 1 ? '1 EVENT' : `${count} EVENTS`;
    return this.isToday() ? `TODAY · ${label}` : label;
  });

  constructor() {
    const timer = setInterval(() => this.tick(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    void this.load();
  }

  shift(days: number): void {
    this.selectedDay.set(shiftDay(this.selectedDay(), days));
    void this.load();
  }

  jumpTo(day: string): void {
    this.selectedDay.set(day);
    void this.load();
  }

  minutesAway(start: string): number {
    return minutesUntil(start, this.now());
  }

  duration(minutes: number): string {
    return formatDuration(minutes);
  }

  trackRow(row: AgendaRow): string {
    return row.key;
  }

  private tick(): void {
    const now = new Date();
    this.now.set(now);
    this.rows.set(buildAgendaRows(this.events, now));
  }

  private async load(): Promise<void> {
    const id = ++this.requestId;
    const day = this.selectedDay();
    const { start, end } = dayBounds(day);
    this.loading.set(true);
    this.error.set(null);
    try {
      const events = await this.calendar.listEvents(start, end);
      if (id !== this.requestId) return;
      const now = new Date();
      this.now.set(now);
      this.events = events;
      this.rows.set(buildAgendaRows(events, now));
      this.eventCount.set(events.length);
    } catch (err) {
      if (id !== this.requestId) return;
      this.events = [];
      this.rows.set([]);
      this.eventCount.set(0);
      this.error.set(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
}
