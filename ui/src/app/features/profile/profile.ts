import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { downscaleImage } from './downscale-image';

@Component({
  selector: 'app-profile',
  imports: [FormsModule],
  templateUrl: './profile.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly calendar = inject(CalendarService);
  private readonly router = inject(Router);

  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly image = signal<string | null>(null);
  readonly status = signal('');
  readonly busy = signal(false);
  readonly converting = signal(false);

  readonly caldavUrl = signal('');
  readonly caldavUsername = signal('');
  readonly caldavPassword = signal('');
  readonly caldavCalendarName = signal('');
  readonly calendarStatus = signal('');

  ngOnInit(): void {
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
      this.caldavCalendarName.set(creds.calendarName ?? '');
    });
  }

  async saveCalendar(): Promise<void> {
    this.calendarStatus.set('');
    try {
      await this.calendar.save({
        caldavUrl: this.caldavUrl(),
        username: this.caldavUsername(),
        password: this.caldavPassword(),
        calendarName: this.caldavCalendarName(),
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
      this.caldavCalendarName.set('');
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

  async back(): Promise<void> {
    await this.router.navigateByUrl('/');
  }
}
