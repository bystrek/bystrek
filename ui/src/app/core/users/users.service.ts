import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

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

  readonly members = signal<Member[] | null>(null);
  readonly busy = signal(false);

  async load(): Promise<void> {
    try {
      const result = await firstValueFrom(this.http.get<Member[]>(`${environment.apiUrl}/users`));
      this.members.set(result);
    } catch {
      this.members.set(null);
    }
  }

  async invite(name: string, email: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/users/invite`, { email, name }));
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
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/users/${member.id}/${action}`, {}),
      );
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
