import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

export type Member = { id: string; name: string | null; status: string; banned: boolean };

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string } | null;
    return body?.message ?? fallback;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly members = signal<Member[] | null>(null);
  readonly busy = signal(false);

  async load(): Promise<void> {
    try {
      const result = await firstValueFrom(this.http.get<Member[]>(`${this.apiUrl}/users`));
      this.members.set(result);
    } catch {
      this.members.set(null);
    }
  }

  async invite(name: string, email: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/users/invite`, { email, name }));
      await this.load();
    } catch (err) {
      throw new Error(errorMessage(err, 'Invite failed.'));
    } finally {
      this.busy.set(false);
    }
  }

  async toggleBan(member: Member): Promise<void> {
    this.busy.set(true);
    try {
      const action = member.banned ? 'unban' : 'ban';
      await firstValueFrom(this.http.post(`${this.apiUrl}/users/${member.id}/${action}`, {}));
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
