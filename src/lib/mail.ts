import nodemailer from 'nodemailer';

export const mailConfigured = () => Boolean(process.env.SMTP_URL);

/** Show confirmation links in the browser instead of emailing them. Never in production. */
export const showLinksInBrowser = () =>
  !mailConfigured() && (process.env.NODE_ENV !== 'production' || process.env.SHOW_VERIFY_LINKS === '1');

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!mailConfigured()) {
    console.log(`\n[mail not configured] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL!);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? 'Countersign <no-reply@localhost>', to, subject, text });
}

const hits = new Map<string, number[]>();

/** Small in-memory limiter. Put a real one at the edge for large deployments. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) hits.clear();
  return true;
}

export const siteName = () => process.env.SITE_NAME ?? 'Countersign';
