import { RESEND_API_KEY } from '../env';

// Must be a domain verified in Resend (SPF/DKIM DNS records) — bystrek.dev
// is owned via Cloudflare, same as everything else, but the Resend-side
// verification is a manual dashboard step, not something this code can do.
const FROM = 'bystrek <noreply@bystrek.dev>';

export async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}
