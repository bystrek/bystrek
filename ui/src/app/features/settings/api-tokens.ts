import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { ApiToken, ApiTokensService } from '../../core/auth/api-tokens.service';
import { Alert } from '../../shared/alert/alert';
import { Button } from '../../shared/button/button';
import { StatusBanner } from '../../shared/status-banner/status-banner';

// The API's limit (better-auth's api-key plugin default).
const MAX_NAME_LENGTH = 32;

/** Create, list and revoke personal API tokens, for apps that push data to bystrek. */
@Component({
  selector: 'app-api-tokens',
  imports: [Alert, Button, DatePipe, FormField, FormRoot, StatusBanner],
  templateUrl: './api-tokens.html',
  styleUrl: './api-tokens.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiTokens implements OnInit {
  protected readonly service = inject(ApiTokensService);

  /** The token just created, shown until dismissed; it can't be shown again. */
  protected readonly created = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly error = signal('');
  protected readonly revoking = signal<string | null>(null);

  private readonly model = signal({ name: '' });
  protected readonly createForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Name the token after the app that will use it.' });
      maxLength(path.name, MAX_NAME_LENGTH, {
        message: `Use at most ${MAX_NAME_LENGTH} characters.`,
      });
    },
    {
      submission: {
        action: async () => {
          try {
            this.created.set(await this.service.create(this.model().name));
            this.copied.set(false);
            this.createForm().reset({ name: '' });
            return undefined;
          } catch (err) {
            return { kind: 'server', message: (err as Error).message };
          }
        },
      },
    },
  );

  async ngOnInit(): Promise<void> {
    await this.run(() => this.service.load());
  }

  protected async revoke(token: ApiToken): Promise<void> {
    if (!confirm(`Revoke “${token.name}”? Apps using it stop working.`)) return;
    this.revoking.set(token.id);
    await this.run(() => this.service.revoke(token.id));
    this.revoking.set(null);
  }

  protected async copy(token: string): Promise<void> {
    await navigator.clipboard.writeText(token);
    this.copied.set(true);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.error.set('');
    try {
      await action();
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }
}
