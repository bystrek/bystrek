import { LOCALHOST_ORIGIN, UI_URL } from '../env';

/**
 * Where sign-in may hand a session back to: the UI, or any localhost UI (the
 * same rule CORS and `trustedOrigins` use). Returns the parsed URL, or null
 * for anything else, so a one-time token never leaves for another site.
 */
export function allowedReturnUrl(to: unknown): URL | null {
  if (typeof to !== 'string' || !URL.canParse(to)) return null;
  const url = new URL(to);
  return url.origin === new URL(UI_URL).origin || LOCALHOST_ORIGIN.test(url.origin) ? url : null;
}
