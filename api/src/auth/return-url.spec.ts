import { describe, expect, it } from 'bun:test';
import { UI_URL } from '../env';
import { allowedReturnUrl } from './return-url';

describe('allowedReturnUrl', () => {
  it('accepts the UI and localhost UIs', () => {
    expect(allowedReturnUrl(`${UI_URL}/auth/callback`)?.href).toBe(
      new URL('/auth/callback', UI_URL).href,
    );
    expect(allowedReturnUrl('http://localhost:4200/auth/callback')).not.toBeNull();
    expect(allowedReturnUrl('http://localhost/auth/callback')).not.toBeNull();
  });

  it('rejects other sites and anything that is not an absolute URL', () => {
    expect(allowedReturnUrl('https://evil.example/auth/callback')).toBeNull();
    expect(allowedReturnUrl('http://localhost.evil.example/auth/callback')).toBeNull();
    expect(allowedReturnUrl('https://localhost/auth/callback')).toBeNull();
    expect(allowedReturnUrl('/auth/callback')).toBeNull();
    expect(allowedReturnUrl(['http://localhost:4200/'])).toBeNull();
    expect(allowedReturnUrl(undefined)).toBeNull();
  });
});
