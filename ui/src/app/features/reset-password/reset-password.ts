import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, form, minLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StatusBanner } from '../../shared/status-banner/status-banner';

@Component({
  selector: 'app-reset-password',
  imports: [FormField, FormRoot, StatusBanner],
  templateUrl: './reset-password.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reset-password.css',
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly token = this.route.snapshot.queryParamMap.get('token');
  readonly error = this.route.snapshot.queryParamMap.get('error');

  private readonly model = signal({ newPassword: '' });
  protected readonly resetForm = form(this.model, (path) => {
    required(path.newPassword);
    minLength(path.newPassword, 8);
  });

  readonly status = signal('');
  readonly statusError = signal(false);
  readonly busy = signal(false);
  readonly done = signal(false);

  async submit(): Promise<void> {
    if (!this.token) return;
    if (this.resetForm().invalid()) {
      this.resetForm().markAsTouched();
      return;
    }
    this.busy.set(true);
    this.status.set('');
    this.statusError.set(false);
    try {
      await this.auth.resetPassword(this.model().newPassword, this.token);
      this.done.set(true);
      this.status.set('Password updated. Redirecting to sign in…');
      setTimeout(() => this.router.navigateByUrl('/'), 1500);
    } catch (err) {
      this.status.set((err as Error).message);
      this.statusError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
