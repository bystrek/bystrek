import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule],
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

  readonly newPassword = signal('');
  readonly status = signal('');
  readonly busy = signal(false);
  readonly done = signal(false);

  async submit(): Promise<void> {
    if (!this.token) return;
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.resetPassword(this.newPassword(), this.token);
      this.done.set(true);
      this.status.set('Password updated. Redirecting to sign in…');
      setTimeout(() => this.router.navigateByUrl('/'), 1500);
    } catch (err) {
      this.status.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
