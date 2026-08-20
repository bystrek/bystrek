import { join } from 'node:path';

const DIST_DIR = join(import.meta.dir, 'browser');

Bun.serve({
  port: 3000,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);

    // Reject path traversal attempts outright.
    if (pathname.includes('..')) {
      return new Response('Not found', { status: 404 });
    }

    let file = pathname === '/' ? null : Bun.file(join(DIST_DIR, pathname));

    // Serve the file as-is if it exists (covers /sw.js, /apple-touch-icon.png,
    // and every hashed JS/CSS bundle). Otherwise — including real routes like
    // /login or /auth/reset-password hit as a fresh navigation, e.g. from a
    // password-reset email link — fall back to index.html and let the
    // Angular router take over client-side.
    if (!file || !(await file.exists())) {
      file = Bun.file(join(DIST_DIR, 'index.html'));
    }

    return new Response(file);
  },
});

console.log(`Serving ${DIST_DIR} on :3000`);
