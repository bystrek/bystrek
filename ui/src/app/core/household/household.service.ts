import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Member = { id: string; name: string | null; status: string; banned: boolean };
export type Household = { name: string; members: Member[] };

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string } | null;
    return body?.message ?? fallback;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly http = inject(HttpClient);

  readonly household = signal<Household | null>(null);
  readonly busy = signal(false);

  async load(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<Household>(`${environment.apiUrl}/household`),
      );
      this.household.set(result);
    } catch {
      this.household.set(null);
    }
  }

  async invite(name: string, email: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/household/invite`, { email, name }),
      );
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
        this.http.post(`${environment.apiUrl}/household/members/${member.id}/${action}`, {}),
      );
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
