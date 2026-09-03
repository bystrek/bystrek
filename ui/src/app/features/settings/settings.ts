import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarOption, CalendarService } from '../../core/calendar/calendar.service';
import { PushService } from '../../core/push/push.service';
import { UsersService, type Member } from '../../core/users/users.service';
import { downscaleImage } from './downscale-image';

@Component({
  selector: 'app-settings',
  imports: [FormField, FormRoot],
  templateUrl: './settings.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly calendar = inject(CalendarService);
  protected readonly push = inject(PushService);
  protected readonly users = inject(UsersService);

  private readonly profileModel = signal({ firstName: '', lastName: '' });
  protected readonly profileForm = form(this.profileModel, (path) => {
    required(path.firstName);
    required(path.lastName);
  });

  readonly image = signal<string | null>(null);
  readonly status = signal('');
  readonly busy = signal(false);
  readonly converting = signal(false);

  // '' means "use the account's first calendar" (calendarUrl: null).
  private readonly calendarModel = signal({
    caldavUrl: '',
    caldavUsername: '',
    caldavPassword: '',
    selectedCalendarUrl: '',
  });
  protected readonly calendarForm = form(this.calendarModel, (path) => {
    required(path.caldavUrl);
    required(path.caldavUsername);
    required(path.caldavPassword, { when: () => !this.calendar.credentials()?.configured });
  });
  readonly calendarStatus = signal('');

  readonly calendarOptions = signal<CalendarOption[]>([]);
  readonly loadingCalendars = signal(false);

  private readonly inviteModel = signal({ inviteName: '', inviteEmail: '' });
  protected readonly inviteForm = form(this.inviteModel, (path) => {
    required(path.inviteName);
    required(path.inviteEmail);
    email(path.inviteEmail);
  });
  readonly inviteStatus = signal('');

  ngOnInit(): void {
    void this.push.checkExistingSubscription();
    void this.users.load();

    const user = this.auth.session()?.user;
    if (!user) return;
    this.profileModel.set({ firstName: user.firstName ?? '', lastName: user.lastName ?? '' });
    this.image.set(user.image);

    void this.calendar.load().then(() => {
      const creds = this.calendar.credentials();
      if (!creds?.configured) return;
      this.calendarModel.update((m) => ({
        ...m,
        caldavUrl: creds.caldavUrl ?? m.caldavUrl,
        caldavUsername: creds.username ?? '',
        selectedCalendarUrl: creds.calendarUrl ?? '',
      }));
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
        caldavUrl: this.calendarModel().caldavUrl,
        username: this.calendarModel().caldavUsername,
        password: this.calendarModel().caldavPassword,
      });
      this.calendarOptions.set(options);
      if (!options.some((o) => o.url === this.calendarModel().selectedCalendarUrl)) {
        this.calendarModel.update((m) => ({ ...m, selectedCalendarUrl: '' }));
      }
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
    } finally {
      this.loadingCalendars.set(false);
    }
  }

  async saveCalendar(): Promise<void> {
    if (this.calendarForm().invalid()) {
      this.calendarForm().markAsTouched();
      return;
    }
    this.calendarStatus.set('');
    try {
      const selected = this.calendarOptions().find(
        (o) => o.url === this.calendarModel().selectedCalendarUrl,
      );
      await this.calendar.save({
        caldavUrl: this.calendarModel().caldavUrl,
        username: this.calendarModel().caldavUsername,
        password: this.calendarModel().caldavPassword,
        calendarUrl: selected?.url ?? null,
        calendarDisplayName: selected?.displayName ?? null,
      });
      this.calendarModel.update((m) => ({ ...m, caldavPassword: '' }));
      this.calendarStatus.set('Saved.');
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
    }
  }

  async disconnectCalendar(): Promise<void> {
    this.calendarStatus.set('');
    try {
      await this.calendar.disconnect();
      this.calendarModel.update((m) => ({ ...m, caldavUsername: '', selectedCalendarUrl: '' }));
      this.calendarOptions.set([]);
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
    if (this.profileForm().invalid()) {
      this.profileForm().markAsTouched();
      return;
    }
    this.busy.set(true);
    this.status.set('');
    try {
      const { firstName, lastName } = this.profileModel();
      await this.auth.updateProfile(firstName, lastName, this.image());
      this.status.set('Saved.');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async invite(): Promise<void> {
    if (this.inviteForm().invalid()) {
      this.inviteForm().markAsTouched();
      return;
    }
    this.inviteStatus.set('');
    try {
      const { inviteName, inviteEmail } = this.inviteModel();
      await this.users.invite(inviteName, inviteEmail);
      this.inviteModel.set({ inviteName: '', inviteEmail: '' });
      this.inviteStatus.set('Invited — they’ll get an email to set a password.');
    } catch (err) {
      this.inviteStatus.set((err as Error).message);
    }
  }

  toggleBan(member: Member): void {
    void this.users.toggleBan(member);
  }
}
