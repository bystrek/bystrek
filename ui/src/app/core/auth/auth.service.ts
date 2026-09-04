import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

const TOKEN_KEY = 'bystrek_token';

export type Session = {
  user: {
    id: string;
    name: string | null;
    role: string;
    firstName: string | null;
    lastName: string | null;
    image: string | null;
  };
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly session = signal<Session | null>(null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  private clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  /** Resolves the current session from the stored token, if any. Never
   * rejects — an unreachable API or an expired token just means no session,
   * not a broken app boot (this runs from an app initializer). */
  async initSession(): Promise<void> {
    if (!this.getToken()) {
      this.session.set(null);
      return;
    }
    try {
      const session = await firstValueFrom(
        this.http.get<Session | null>(`${this.apiUrl}/api/auth/get-session`),
      );
      this.session.set(session);
    } catch {
      this.session.set(null);
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    let res;
    try {
      res = await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/api/auth/sign-in/email`,
          { email, password },
          { observe: 'response' },
        ),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Sign in failed.'));
    }
    const token = res.headers.get('set-auth-token');
    if (!token) throw new Error('Sign in succeeded but no session token was returned.');
    this.setToken(token);
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/api/auth/sign-out`, {}));
    } catch {
      // Clear the local token regardless of whether the request succeeded.
    }
    this.clearToken();
    this.session.set(null);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    try {
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/api/auth/request-password-reset`, {
          email,
          redirectTo,
        }),
      );
    } catch {
      throw new Error('Could not request a password reset.');
    }
  }

  async updateProfile(firstName: string, lastName: string, image: string | null): Promise<void> {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      throw new Error('First and last name are required.');
    }
    const name = `${trimmedFirst} ${trimmedLast}`;
    try {
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/api/auth/update-user`, {
          name,
          firstName: trimmedFirst,
          lastName: trimmedLast,
          image,
        }),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not update your profile.'));
    }
    await this.initSession();
  }

  async resetPassword(newPassword: string, token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/api/auth/reset-password`, { newPassword, token }),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not reset the password.'));
    }
  }
}
