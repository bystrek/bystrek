import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { Card } from '../../shared/card/card';
import { Stack } from '../../shared/stack/stack';

const MIN_BUSY_MS = 400;

@Component({
  selector: 'app-login',
  imports: [FormField, FormRoot, Alert, Button, Card, Stack],
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

  dismissStatus(): void {
    this.status.set('');
    this.statusError.set(false);
  }

  /* Keeps the busy label visible long enough to read, even when the request fails instantly. */
  private async withMinimumBusy<T>(work: Promise<T>): Promise<T> {
    const minimumDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_BUSY_MS));
    try {
      return await work;
    } finally {
      await minimumDelay;
    }
  }

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      this.loginForm().markAsTouched();
      return;
    }
    this.pendingAction.set('signin');
    this.status.set('');
    this.statusError.set(false);
    try {
      await this.withMinimumBusy(this.auth.signIn(this.model().email, this.model().password));
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
      await this.withMinimumBusy(this.auth.requestPasswordReset(this.model().email));
      this.status.set('If that email exists, a reset link is on its way.');
    } catch (err) {
      this.status.set((err as Error).message);
      this.statusError.set(true);
    } finally {
      this.pendingAction.set(null);
    }
  }
}
