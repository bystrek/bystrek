import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly status = signal('');
  readonly busy = signal(false);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.signIn(this.email(), this.password());
      this.password.set('');
      await this.auth.initSession();
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async forgotPassword(): Promise<void> {
    if (!this.email()) {
      this.status.set('Enter your email above first, then click this again.');
      return;
    }
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.requestPasswordReset(this.email());
      this.status.set('If that email exists, a reset link is on its way.');
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
