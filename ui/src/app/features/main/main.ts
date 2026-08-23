import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UsersService, type Member } from '../../core/users/users.service';
import { PushService } from '../../core/push/push.service';

@Component({
  selector: 'app-main',
  imports: [FormsModule, RouterLink],
  templateUrl: './main.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './main.css',
})
export class Main implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly push = inject(PushService);
  protected readonly users = inject(UsersService);
  private readonly router = inject(Router);

  readonly inviteName = signal('');
  readonly inviteEmail = signal('');
  readonly inviteStatus = signal('');

  ngOnInit(): void {
    void this.push.checkExistingSubscription();
    void this.users.load();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  async invite(): Promise<void> {
    this.inviteStatus.set('');
    try {
      await this.users.invite(this.inviteName(), this.inviteEmail());
      this.inviteName.set('');
      this.inviteEmail.set('');
      this.inviteStatus.set('Invited — they’ll get an email to set a password.');
    } catch (err) {
      this.inviteStatus.set((err as Error).message);
    }
  }

  toggleBan(member: Member): void {
    void this.users.toggleBan(member);
  }
}
