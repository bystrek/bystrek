import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CalendarEvent, CalendarEventsService } from '../../../core/calendar/calendar-events.service';
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
export class EventDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly calendarEvents = inject(CalendarEventsService);

  protected readonly formatTime = formatTime;

  readonly event = signal<CalendarEvent | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    const uid = this.route.snapshot.paramMap.get('uid');
    if (!uid) {
      this.error.set('No event specified.');
      this.loading.set(false);
      return;
    }
    void this.load(uid);
  }

  private async load(uid: string): Promise<void> {
    try {
      this.event.set(await this.calendarEvents.getEvent(uid));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
