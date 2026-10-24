import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Temporal } from '@js-temporal/polyfill';
import { map, timer } from 'rxjs';
import { CalendarEvent, CalendarService } from '../../core/calendar/calendar.service';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Progress } from '../../shared/progress/progress';
import { Tag } from '../../shared/tag/tag';
import { AskBar } from './ask-bar';
import {
  AgendaRow,
  buildAgendaRows,
  formatDayLabel,
  formatDuration,
  minutesUntil,
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

  // Emits the current time every minute; the "Next · in X min" labels follow it.
  readonly now = toSignal(timer(0, 60_000).pipe(map(() => Temporal.Now.instant())), {
    initialValue: Temporal.Now.instant(),
  });
  readonly timezone = signal<string | null>(null);
  readonly selectedDay = signal<Temporal.PlainDate | null>(null);
  private readonly events = signal<CalendarEvent[]>([]);
  readonly rows = computed(() => buildAgendaRows(this.events(), this.now()));
  readonly eventCount = computed(() => this.events().length);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly askBusy = signal(false);

  readonly dayLabel = computed(() => {
    const day = this.selectedDay();
    return day ? formatDayLabel(day) : '';
  });
  readonly isToday = computed(() => {
    const timeZone = this.timezone();
    const day = this.selectedDay();
    return timeZone !== null && day !== null && this.today(timeZone).equals(day);
  });
  readonly subtitle = computed(() => {
    const count = this.eventCount();
    const label = count === 1 ? '1 EVENT' : `${count} EVENTS`;
    return this.isToday() ? `TODAY · ${label}` : label;
  });

  constructor() {
    void this.init();
  }

  shift(days: number): void {
    const day = this.selectedDay();
    if (!day) return;
    this.selectedDay.set(day.add({ days }));
    void this.load();
  }

  jumpTo(day: Temporal.PlainDate): void {
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

  // "Today" is the account's day, so the timezone must load before the first list.
  private today(timeZone: string): Temporal.PlainDate {
    return this.now().toZonedDateTimeISO(timeZone).toPlainDate();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    try {
      const timeZone = await this.calendar.getTimezone();
      this.timezone.set(timeZone);
      this.selectedDay.set(this.today(timeZone));
    } catch (err) {
      this.loading.set(false);
      this.error.set(err instanceof Error ? err.message : 'Could not load your timezone.');
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const id = ++this.requestId;
    const day = this.selectedDay();
    if (!day) return;
    // Wall-clock bounds without an offset: the API reads these in the user's timezone.
    const start = day.toPlainDateTime().toString();
    const end = day.add({ days: 1 }).toPlainDateTime().toString();
    this.loading.set(true);
    this.error.set(null);
    try {
      const events = await this.calendar.listEvents(start, end);
      if (id !== this.requestId) return;
      this.events.set(events);
    } catch (err) {
      if (id !== this.requestId) return;
      this.events.set([]);
      this.error.set(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
}
