import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { ApiTokens } from './api-tokens';
import { downscaleImage } from './downscale-image';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-settings',
  imports: [ApiTokens, FormField, FormRoot, RouterLink, Icon],
  templateUrl: './settings.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly calendar = inject(CalendarService);

  private readonly profileModel = signal({ firstName: '', lastName: '' });
  protected readonly profileForm = form(this.profileModel, (path) => {
    required(path.firstName);
    required(path.lastName);
  });

  readonly image = signal<string | null>(null);
  readonly status = signal('');
  readonly statusError = signal(false);
  readonly busy = signal(false);
  readonly converting = signal(false);

  readonly calendarStatus = signal('');
  readonly calendarStatusError = signal(false);
  readonly disconnectingCalendar = signal(false);

  ngOnInit(): void {
    const user = this.auth.session()?.user;
    if (!user) return;
    this.profileModel.set({ firstName: user.firstName ?? '', lastName: user.lastName ?? '' });
    this.image.set(user.image);

    void this.calendar.load();
  }

  async disconnectCalendar(): Promise<void> {
    this.calendarStatus.set('');
    this.calendarStatusError.set(false);
    this.disconnectingCalendar.set(true);
    try {
      await this.calendar.disconnect();
      this.calendarStatus.set('Disconnected.');
    } catch (err) {
      this.calendarStatus.set((err as Error).message);
      this.calendarStatusError.set(true);
    } finally {
      this.disconnectingCalendar.set(false);
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
      this.statusError.set(true);
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
    this.statusError.set(false);
    try {
      const { firstName, lastName } = this.profileModel();
      await this.auth.updateProfile(firstName, lastName, this.image());
      this.status.set('Saved.');
    } catch (err) {
      this.status.set((err as Error).message);
      this.statusError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
