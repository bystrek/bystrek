import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CalendarEvent,
  CalendarEventsService,
} from '../../../core/calendar/calendar-events.service';
import { Icon } from '../../../shared/icon/icon';
import { StatusBanner } from '../../../shared/status-banner/status-banner';
import { formatTime } from '../date-utils';

@Component({
  selector: 'app-event-detail',
  imports: [Icon, RouterLink, StatusBanner],
  templateUrl: './event-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './event-detail.css',
})
export class EventDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly calendarEvents = inject(CalendarEventsService);
  private requestId = 0;

  protected readonly formatTime = formatTime;

  // Reactive, not an ngOnInit snapshot — route reuse can keep this instance
  // alive across a uid-only navigation.
  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly event = signal<CalendarEvent | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    effect(() => {
      void this.load(
        this.paramMap().get('uid'),
        this.queryParamMap().get('occurrence') ?? undefined,
      );
    });
  }

  private async load(uid: string | null, occurrence?: string): Promise<void> {
    const requestId = ++this.requestId;
    if (!uid) {
      this.event.set(null);
      this.error.set('No event specified.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.event.set(null);
    this.error.set('');
    try {
      const event = await this.calendarEvents.getEvent(uid, occurrence);
      if (requestId === this.requestId) this.event.set(event);
    } catch (err) {
      if (requestId === this.requestId) this.error.set((err as Error).message);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }
}
