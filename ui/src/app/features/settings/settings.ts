import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarOption, CalendarService } from '../../core/calendar/calendar.service';
import { PushService } from '../../core/push/push.service';
import { UsersService, type Member } from '../../core/users/users.service';
import { downscaleImage } from './downscale-image';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly calendar = inject(CalendarService);
  protected readonly push = inject(PushService);
  protected readonly users = inject(UsersService);

  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly image = signal<string | null>(null);
  readonly status = signal('');
  readonly busy = signal(false);
  readonly converting = signal(false);

  readonly caldavUrl = signal('');
  readonly caldavUsername = signal('');
  readonly caldavPassword = signal('');
  readonly calendarStatus = signal('');

  // '' means "use the account's first calendar" (calendarUrl: null).
  readonly calendarOptions = signal<CalendarOption[]>([]);
  readonly selectedCalendarUrl = signal('');
  readonly loadingCalendars = signal(false);

  readonly inviteName = signal('');
  readonly inviteEmail = signal('');
  readonly inviteStatus = signal('');

  ngOnInit(): void {
    void this.push.checkExistingSubscription();
    void this.users.load();

    const user = this.auth.session()?.user;
    if (!user) return;
    this.firstName.set(user.firstName ?? '');
    this.lastName.set(user.lastName ?? '');
    this.image.set(user.image);

    void this.calendar.load().then(() => {
      const creds = this.calendar.credentials();
      if (!creds?.configured) return;
      this.caldavUrl.set(creds.caldavUrl ?? this.caldavUrl());
      this.caldavUsername.set(creds.username ?? '');
      this.selectedCalendarUrl.set(creds.calendarUrl ?? '');
      if (creds.calendarUrl && creds.calendarDisplayName) {
        this.calendarOptions.set([
          { url: creds.calendarUrl, displayName: creds.calendarDisplayName },
        ]);
      }
    });
  }

  async loadCalendars(): Promise<void> {
    this.calendarStatus.set('');
    this.loadingCalendars.set(true);
    try {
      const options = await this.calendar.previewCalendars({
        caldavUrl: this.caldavUrl(),
        username: this.caldavUsername(),
        password: this.caldavPassword(),
      });
      this.calendarOptions.set(options);
      if (!options.some((o) => o.url === this.selectedCalendarUrl())) {
        this.selectedCalendarUrl.set('');
      }
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
    } finally {
      this.loadingCalendars.set(false);
    }
  }

  async saveCalendar(): Promise<void> {
    this.calendarStatus.set('');
    try {
      const selected = this.calendarOptions().find((o) => o.url === this.selectedCalendarUrl());
      await this.calendar.save({
        caldavUrl: this.caldavUrl(),
        username: this.caldavUsername(),
        password: this.caldavPassword(),
        calendarUrl: selected?.url ?? null,
        calendarDisplayName: selected?.displayName ?? null,
      });
      this.caldavPassword.set('');
      this.calendarStatus.set('Saved.');
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
    }
  }

  async disconnectCalendar(): Promise<void> {
    this.calendarStatus.set('');
    try {
      await this.calendar.disconnect();
      this.caldavUsername.set('');
      this.calendarOptions.set([]);
      this.selectedCalendarUrl.set('');
      this.calendarStatus.set('Disconnected.');
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.converting.set(true);
    try {
      this.image.set(await downscaleImage(file));
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.converting.set(false);
    }
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.updateProfile(this.firstName(), this.lastName(), this.image());
      this.status.set('Saved.');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async invite(): Promise<void> {
    this.inviteStatus.set('');
    try {
      await this.users.invite(this.inviteName(), this.inviteEmail());
      this.inviteName.set('');
      this.inviteEmail.set('');
      this.inviteStatus.set('Invited — they’ll get an email to set a password.');
    } catch (err) {
      this.inviteStatus.set((err as Error).message);
    }
  }

  toggleBan(member: Member): void {
    void this.users.toggleBan(member);
  }
}
