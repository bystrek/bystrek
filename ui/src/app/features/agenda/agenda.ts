import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarEvent, CalendarEventsService } from '../../core/calendar/calendar-events.service';
import { Icon } from '../../shared/icon/icon';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import {
  addDays,
  endOfDay,
  formatDayHeader,
  formatTime,
  formatWeekHeader,
  hourFractionFromIso,
  isSameDay,
  isSameDayAsIso,
  isToday,
  startOfDay,
  startOfWeek,
  weekdayAbbr,
} from './date-utils';

const ViewMode = {
  Day: 'day',
  Week: 'week',
} as const;
type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

type WeekDay = {
  date: Date;
  abbr: string;
  num: number;
  isToday: boolean;
  isSelected: boolean;
  hasEvents: boolean;
  events: (CalendarEvent & { top: number })[];
};

// Widens to fit any event outside this default 07:00-19:00 window.
const DEFAULT_RANGE_START_HOUR = 7;
const DEFAULT_RANGE_END_HOUR = 19;
const PX_PER_HOUR = 40;

@Component({
  selector: 'app-agenda',
  imports: [Icon, RouterLink, StatusBanner],
  templateUrl: './agenda.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './agenda.css',
})
export class Agenda {
  private readonly calendarEvents = inject(CalendarEventsService);

  protected readonly formatTime = formatTime;
  protected readonly ViewMode = ViewMode;

  readonly viewMode = signal<ViewMode>(ViewMode.Day);
  readonly selectedDate = signal(startOfDay(new Date()));
  readonly events = signal<CalendarEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly weekStart = computed(() => startOfWeek(this.selectedDate()));
  readonly dayHeader = computed(() => formatDayHeader(this.selectedDate()));
  readonly weekHeader = computed(() => formatWeekHeader(this.weekStart()));
  readonly isSelectedToday = computed(() => isToday(this.selectedDate()));

  readonly todaysEvents = computed(() => {
    const day = this.selectedDate();
    return this.events()
      .filter((e) => isSameDayAsIso(e.start, day))
      .sort((a, b) => a.start.localeCompare(b.start));
  });

  private readonly hourRange = computed(() => {
    let startHour = DEFAULT_RANGE_START_HOUR;
    let endHour = DEFAULT_RANGE_END_HOUR;
    for (const event of this.events()) {
      startHour = Math.min(startHour, Math.floor(hourFractionFromIso(event.start)));
      endHour = Math.max(endHour, Math.ceil(hourFractionFromIso(event.end)));
    }
    return { startHour, endHour };
  });

  readonly gridHeight = computed(() => {
    const { startHour, endHour } = this.hourRange();
    return (endHour - startHour) * PX_PER_HOUR;
  });

  readonly hourLabels = computed(() => {
    const { startHour, endHour } = this.hourRange();
    return Array.from({ length: endHour - startHour + 1 }, (_, i) => ({
      label: `${String(startHour + i).padStart(2, '0')}:00`,
      top: i * PX_PER_HOUR,
    }));
  });

  readonly weekDays = computed<WeekDay[]>(() => {
    const weekStart = this.weekStart();
    const selected = this.selectedDate();
    const { startHour } = this.hourRange();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const dayEvents = this.events()
        .filter((e) => isSameDayAsIso(e.start, date))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((e) => ({
          ...e,
          top: Math.round((hourFractionFromIso(e.start) - startHour) * PX_PER_HOUR),
        }));
      return {
        date,
        abbr: weekdayAbbr(date),
        num: date.getDate(),
        isToday: isToday(date),
        isSelected: isSameDay(date, selected),
        hasEvents: dayEvents.length > 0,
        events: dayEvents,
      };
    });
  });

  constructor() {
    effect(() => {
      // weekStart(), not selectedDate() — refetch only on week change.
      void this.weekStart();
      void this.refresh();
    });
  }

  selectDay(date: Date): void {
    this.selectedDate.set(startOfDay(date));
  }

  stepDay(delta: number): void {
    this.selectedDate.update((d) => startOfDay(addDays(d, delta)));
  }

  stepWeek(delta: number): void {
    this.selectedDate.update((d) => startOfDay(addDays(d, delta * 7)));
  }

  goToday(): void {
    this.selectedDate.set(startOfDay(new Date()));
  }

  private async refresh(): Promise<void> {
    // Guards a stale response from a slower, superseded request.
    const requestedWeekStart = this.weekStart();
    const isStale = () => this.weekStart().getTime() !== requestedWeekStart.getTime();

    this.loading.set(true);
    this.error.set('');
    try {
      const start = requestedWeekStart;
      const end = endOfDay(addDays(start, 6));
      const events = await this.calendarEvents.listEvents({ start, end });
      if (isStale()) return;
      this.events.set(events);
    } catch (err) {
      if (isStale()) return;
      this.error.set((err as Error).message);
    } finally {
      if (!isStale()) this.loading.set(false);
    }
  }
}
