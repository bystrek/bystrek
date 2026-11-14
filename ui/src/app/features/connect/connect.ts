import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { CalendarService } from '../../core/calendar/calendar.service';
import { Alert } from '../../shared/alert/alert';
import {
  ConnectCredentials,
  ConnectStep,
  ConnectStore,
  ICLOUD_CALDAV_URL,
  Provider,
} from './connect-store';

@Component({
  selector: 'app-connect',
  imports: [Alert, FormField, FormRoot],
  providers: [ConnectStore],
  templateUrl: './connect.html',
  styleUrl: './connect.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Connect implements OnInit {
  protected readonly store = inject(ConnectStore);
  protected readonly calendar = inject(CalendarService);
  protected readonly ConnectStep = ConnectStep;
  protected readonly Provider = Provider;

  private readonly model = signal({ caldavUrl: '', username: '', password: '', calendarUrl: '' });
  protected readonly connectForm = form(this.model, (path) => {
    required(path.caldavUrl);
    required(path.username);
    // A saved account keeps its password when the field is left blank.
    required(path.password, { when: () => !this.calendar.credentials()?.configured });
  });

  ngOnInit(): void {
    // Opened from Settings: start from what is saved.
    void this.calendar.load().then(() => {
      const saved = this.calendar.credentials();
      if (!saved?.configured) return;
      this.model.update((m) => ({
        ...m,
        caldavUrl: saved.caldavUrl ?? '',
        username: saved.username ?? '',
        calendarUrl: saved.calendarUrl ?? '',
      }));
    });
  }

  choose(provider: Provider): void {
    const saved = this.calendar.credentials();
    const savedOther = saved?.configured && saved.caldavUrl !== ICLOUD_CALDAV_URL;
    this.model.update((m) => ({
      ...m,
      caldavUrl:
        provider === Provider.ICLOUD
          ? ICLOUD_CALDAV_URL
          : savedOther
            ? (saved.caldavUrl ?? '')
            : m.caldavUrl === ICLOUD_CALDAV_URL
              ? ''
              : m.caldavUrl,
    }));
    this.store.chooseProvider(provider);
  }

  async next(): Promise<void> {
    if (this.connectForm().invalid()) {
      this.connectForm().markAsTouched();
      return;
    }
    await this.store.loadCalendars(this.credentials());
    if (this.store.error()) return;
    // Keep the saved calendar when it is still there, else preselect the first.
    const calendars = this.store.calendars();
    if (!calendars.some((option) => option.url === this.model().calendarUrl)) {
      this.model.update((m) => ({ ...m, calendarUrl: calendars[0]?.url ?? '' }));
    }
  }

  connect(): Promise<void> {
    return this.store.connect(this.credentials(), this.model().calendarUrl);
  }

  private credentials(): ConnectCredentials {
    const { caldavUrl, username, password } = this.model();
    return { caldavUrl: caldavUrl.trim(), username: username.trim(), password };
  }
}
