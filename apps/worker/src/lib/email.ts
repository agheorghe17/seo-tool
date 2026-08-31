import { logger } from '../logger.js';

/**
 * Epic 12.5 — minimal transactional email via Resend's HTTP API (free tier).
 * No-ops when RESEND_API_KEY is unset. Never throws.
 */
const FROM = process.env.EMAIL_FROM ?? 'SEO Audit <onboarding@resend.dev>';

export async function sendCrawlDoneEmail(to: string, domain: string, siteUrl: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: `Audit SEO gata pentru ${domain}`,
        html: `<p>Crawl-ul pentru <strong>${domain}</strong> s-a terminat.</p><p><a href="${siteUrl}">Vezi raportul</a></p>`,
      }),
    });
    if (!res.ok) logger.warn({ status: res.status }, 'resend email failed');
  } catch (err) {
    logger.warn({ err }, 'resend email error');
  }
}
