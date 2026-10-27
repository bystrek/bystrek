import { Component, ChangeDetectionStrategy, Pipe, PipeTransform, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, Session } from '../../core/auth/auth.service';

/** Two-letter fallback for the avatar when the user has no picture. */
@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(user: Session['user'] | undefined): string {
    if (!user) return '';
    const parts = [user.firstName, user.lastName].filter((p): p is string => !!p?.trim());
    const source = parts.length ? parts : (user.name ?? '').trim().split(/\s+/);
    return source
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase();
  }
}

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InitialsPipe],
  templateUrl: './layout.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './layout.css',
})
export class Layout {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/login');
  }
}
