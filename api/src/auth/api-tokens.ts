import { apiKey } from '@better-auth/api-key';

export const API_TOKEN_PREFIX = 'bystrek_';

/**
 * Personal API tokens, for pushes that can't sign in through Pocket ID (the
 * Health Auto Export app). better-auth's api-key plugin stores only a SHA-256
 * hash and serves the session-authenticated `/api/auth/api-key/{create,list,delete}`
 * routes the settings page uses. A token is not a session: only routes guarded
 * by `ApiTokenGuard` accept it.
 */
export const apiTokens = () =>
  apiKey({
    defaultPrefix: API_TOKEN_PREFIX,
    requireName: true,
    // Enough of the token after the prefix to tell two apart in the list.
    startingCharactersConfig: { charactersLength: API_TOKEN_PREFIX.length + 4 },
    // The default (10 requests a day) would cut off a scheduled push.
    rateLimit: { enabled: false },
    // Stored as `api_tokens` (see db/schema.ts) rather than the plugin's `apikeys`.
    schema: { apikey: { modelName: 'apiToken' } },
  });
