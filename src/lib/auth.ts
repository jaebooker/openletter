import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db } from '../db';
import { signers, type Signer } from '../db/schema';

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const secureCookies = () => process.env.SITE_URL?.startsWith('https://') ?? false;
const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: secureCookies(), path: '/', maxAge });

export async function baseUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'}`;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

// --- Signers: one session cookie per letter, set when the email is confirmed.

const signerCookie = (letterId: number) => `cs_signer_${letterId}`;

export async function startSignerSession(signerId: number, letterId: number, token: string) {
  (await cookies()).set(signerCookie(letterId), `${signerId}.${token}`, cookieOpts(60 * 60 * 24 * 90));
}

export async function currentSigner(letterId: number): Promise<Signer | null> {
  const raw = (await cookies()).get(signerCookie(letterId))?.value;
  if (!raw) return null;
  const dot = raw.indexOf('.');
  const id = Number(raw.slice(0, dot));
  if (!Number.isInteger(id)) return null;
  const d = await db();
  const [s] = await d
    .select()
    .from(signers)
    .where(and(eq(signers.id, id), eq(signers.letterId, letterId), eq(signers.status, 'verified')));
  if (!s?.sessionTokenHash || !safeEqual(s.sessionTokenHash, hashToken(raw.slice(dot + 1)))) return null;
  return s;
}

// --- Admin: a single shared password from the environment.

const ADMIN_COOKIE = 'cs_admin';
const adminSecret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
const adminMac = (exp: string) => createHmac('sha256', adminSecret()).update(`admin.${exp}`).digest('hex');

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, adminMac(exp));
}

export async function adminLoginWith(password: string): Promise<boolean> {
  if (!adminConfigured() || !safeEqual(hashToken(password), hashToken(process.env.ADMIN_PASSWORD!))) return false;
  const maxAge = 60 * 60 * 12;
  const exp = String(Date.now() + maxAge * 1000);
  (await cookies()).set(ADMIN_COOKIE, `${exp}.${adminMac(exp)}`, cookieOpts(maxAge));
  return true;
}

export async function adminLogoutNow() {
  (await cookies()).delete(ADMIN_COOKIE);
}
