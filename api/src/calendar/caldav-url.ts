import { BadRequestException } from '@nestjs/common';

// Basic SSRF defense-in-depth, not a hardened boundary — every account
// holder here is an already-trusted invited household member (see
// docs/architecture.md's Auth section), so this guards against a typo or a
// compromised account pointing the server at an internal/metadata host, not
// a fully adversarial multi-tenant threat model (no DNS-rebinding-safe
// redirect handling, no live resolution check).
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local, incl. the common cloud metadata endpoint
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?f[cd][0-9a-f]{2}:/i, // unique local (fc00::/7)
];

export function assertSafeCaldavUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('caldavUrl must be a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('caldavUrl must use https');
  }
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new BadRequestException('caldavUrl must not point at a private/internal host');
  }
}
