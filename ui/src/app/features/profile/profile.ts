import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
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
  private readonly router = inject(Router);

  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly image = signal<string | null>(null);
  readonly status = signal('');
  readonly busy = signal(false);
  readonly converting = signal(false);

  ngOnInit(): void {
    const user = this.auth.session()?.user;
    if (!user) return;
    this.firstName.set(user.firstName ?? '');
    this.lastName.set(user.lastName ?? '');
    this.image.set(user.image);
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
