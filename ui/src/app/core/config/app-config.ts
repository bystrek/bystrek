import { InjectionToken } from '@angular/core';

/** Runtime config, served as `/config.json` next to the app bundle and
 * fetched before bootstrap. `public/config.json` is the dev default
 * (same-origin `/api`, proxied by the dev server); the image overwrites it
 * with `config.prod.json`. */
export type AppConfig = {
  apiUrl: string;
};

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export async function loadAppConfig(): Promise<AppConfig> {
  const res = await fetch('/config.json', { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load /config.json: ${res.status}`);
  }
  return (await res.json()) as AppConfig;
}
