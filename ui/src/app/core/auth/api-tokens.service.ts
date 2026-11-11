import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { errorMessage } from '../http/error-message';

/** A personal API token as listed: never the token itself, only its first characters. */
export type ApiToken = {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
  lastRequest: string | null;
};

/** Personal API tokens, served by better-auth's api-key plugin. */
@Injectable({ providedIn: 'root' })
export class ApiTokensService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(APP_CONFIG).apiUrl}/api/auth/api-key`;

  readonly tokens = signal<ApiToken[]>([]);

  async load(): Promise<void> {
    try {
      const { apiKeys } = await firstValueFrom(
        this.http.get<{ apiKeys: ApiToken[] }>(`${this.baseUrl}/list`),
      );
      this.tokens.set(apiKeys);
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not load your API tokens.'));
    }
  }

  /**
   * Returns the new token. The API never shows it again, so this doesn't
   * reload the list: a failed reload must not lose the token. Call `load()` after.
   */
  async create(name: string): Promise<string> {
    try {
      const { key } = await firstValueFrom(
        this.http.post<{ key: string }>(`${this.baseUrl}/create`, { name: name.trim() }),
      );
      return key;
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not create the token.'));
    }
  }

  async revoke(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/delete`, { keyId: id }));
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not revoke the token.'));
    }
    await this.load();
  }
}
