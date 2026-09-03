import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormField, FormRoot],
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
  readonly busy = signal(false);

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      this.loginForm().markAsTouched();
      return;
    }
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.signIn(this.model().email, this.model().password);
      this.model.update((m) => ({ ...m, password: '' }));
      await this.auth.initSession();
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async forgotPassword(): Promise<void> {
    if (!this.model().email) {
      this.status.set('Enter your email above first, then click this again.');
      return;
    }
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.requestPasswordReset(this.model().email);
      this.status.set('If that email exists, a reset link is on its way.');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
