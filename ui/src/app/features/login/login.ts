import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StatusBanner } from '../../shared/status-banner/status-banner';

@Component({
  selector: 'app-login',
  imports: [FormField, FormRoot, StatusBanner],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });

  readonly status = signal('');
  readonly statusError = signal(false);
  readonly pendingAction = signal<'signin' | 'reset' | null>(null);
  readonly busy = computed(() => this.pendingAction() !== null);

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      this.loginForm().markAsTouched();
      return;
    }
    this.pendingAction.set('signin');
    this.status.set('');
    this.statusError.set(false);
    try {
      await this.auth.signIn(this.model().email, this.model().password);
      this.model.update((m) => ({ ...m, password: '' }));
      await this.auth.initSession();
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.status.set((err as Error).message);
      this.statusError.set(true);
    } finally {
      this.pendingAction.set(null);
    }
  }

  async forgotPassword(): Promise<void> {
    if (!this.model().email) {
      this.status.set('Enter your email above first, then click this again.');
      this.statusError.set(true);
      return;
    }
    this.pendingAction.set('reset');
    this.status.set('');
    this.statusError.set(false);
    try {
      await this.auth.requestPasswordReset(this.model().email);
      this.status.set('If that email exists, a reset link is on its way.');
    } catch (err) {
      this.status.set((err as Error).message);
      this.statusError.set(true);
    } finally {
      this.pendingAction.set(null);
    }
  }
}
