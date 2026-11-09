import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

const TOKEN_KEY = 'bystrek_token';
// Ties a sign-in callback to the tab that started it.
const SIGN_IN_STATE_KEY = 'bystrek_sign_in_state';

/** The callback didn't come from a sign-in this tab started, e.g. a forwarded link. */
export class SignInStateMismatch extends Error {
  constructor() {
    super('This sign-in was not started here.');
  }
}

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
  private readonly location = inject(DOCUMENT).location;

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

  /** Leaves for Pocket ID. It comes back to `/auth/callback` with `?ott=` or `?error=`. */
  startSignIn(): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem(SIGN_IN_STATE_KEY, state);
    const to = `${this.location.origin}/auth/callback?state=${state}`;
    this.location.assign(`${this.apiUrl}/auth/sign-in?to=${encodeURIComponent(to)}`);
  }

  /**
   * Swaps the one-time token from the sign-in redirect for a session, but only
   * for the sign-in this tab started (`state`), so a forwarded callback link
   * can't sign anyone into someone else's account.
   */
  async completeSignIn(oneTimeToken: string, state: string | null): Promise<void> {
    const expected = sessionStorage.getItem(SIGN_IN_STATE_KEY);
    sessionStorage.removeItem(SIGN_IN_STATE_KEY);
    if (!state || state !== expected) throw new SignInStateMismatch();
    let res;
    try {
      res = await firstValueFrom(
        this.http.post(
          `${this.apiUrl}/api/auth/one-time-token/verify`,
          { token: oneTimeToken },
          { observe: 'response' },
        ),
      );
    } catch (err) {
      throw new Error(errorMessage(err, 'Sign in failed.'));
    }
    const token = res.headers.get('set-auth-token');
    if (!token) throw new Error('Sign in succeeded but no session token was returned.');
    this.setToken(token);
    await this.initSession();
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
}
