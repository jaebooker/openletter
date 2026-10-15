'use server';

import { and, eq, gt, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { authReviews, comparisons, letters, signers } from '@/db/schema';
import {
  adminLoginWith,
  adminLogoutNow,
  baseUrl,
  clientIp,
  currentSigner,
  hashToken,
  isAdmin,
  newToken,
  startSignerSession,
} from '@/lib/auth';
import { rateLimit, sendMail, showLinksInBrowser, siteName } from '@/lib/mail';
import { recomputeLetter } from '@/lib/recompute';

const str = (fd: FormData, key: string, max = 300) => String(fd.get(key) ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/;
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cleanUrl(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- signing

export type SignState = { ok?: boolean; error?: string; devLink?: string; email?: string };

export async function signLetter(_prev: SignState, fd: FormData): Promise<SignState> {
  if (str(fd, 'website')) return { ok: true }; // honeypot: bots fill every field
  const name = str(fd, 'name', 120);
  const email = str(fd, 'email', 254).toLowerCase();
  if (name.length < 2) return { error: 'Please enter your full name.' };
  if (!EMAIL.test(email)) return { error: 'Please enter a valid email address.' };
  if (!rateLimit(`sign:${await clientIp()}`, 8, 10 * 60 * 1000)) {
    return { error: 'Too many attempts from this network. Please try again in a few minutes.' };
  }

  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.slug, str(fd, 'slug')));
  if (!letter || letter.status !== 'published') return { error: 'This letter is not open for signatures.' };

  const profile = {
    name,
    title: str(fd, 'title', 160),
    country: str(fd, 'country', 80),
    url: cleanUrl(str(fd, 'url', 300)),
    showDomain: fd.get('showDomain') === 'on',
  };
  const token = newToken();
  const fresh = { verifyTokenHash: hashToken(token), verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS) };
  const done: SignState = { ok: true, email };

  const [existing] = await d
    .select()
    .from(signers)
    .where(and(eq(signers.letterId, letter.id), eq(signers.email, email)));
  // Same response whether or not the address has signed, so the form cannot be
  // used to check who is on the list.
  if (existing?.status === 'removed') return done;
  if (existing) {
    await d
      .update(signers)
      .set(existing.status === 'pending' ? { ...profile, ...fresh } : fresh)
      .where(eq(signers.id, existing.id));
  } else {
    await d.insert(signers).values({ letterId: letter.id, email, ...profile, ...fresh });
  }

  const link = `${await baseUrl()}/verify?token=${token}`;
  await sendMail(
    email,
    `Confirm your signature: ${letter.title}`,
    `Hello ${name},\n\nPlease confirm your signature on "${letter.title}" by opening this link:\n\n${link}\n\nThe link works for 7 days. If you did not sign, ignore this message and your name will not appear.\n\n${siteName()}`,
  );
  return showLinksInBrowser() ? { ...done, devLink: link } : done;
}

export async function confirmSignature(fd: FormData) {
  const d = await db();
  const [s] = await d
    .select()
    .from(signers)
    .where(
      and(
        eq(signers.verifyTokenHash, hashToken(str(fd, 'token'))),
        gt(signers.verifyExpiresAt, new Date()),
        ne(signers.status, 'removed'),
      ),
    );
  if (!s) redirect('/verify?invalid=1');
  const [letter] = await d.select().from(letters).where(eq(letters.id, s.letterId));

  const h = await headers();
  const session = newToken();
  await d
    .update(signers)
    .set({
      status: 'verified',
      verifiedAt: s.verifiedAt ?? new Date(),
      verifyTokenHash: null,
      verifyExpiresAt: null,
      sessionTokenHash: hashToken(session),
      geoCountry: h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? s.geoCountry,
    })
    .where(eq(signers.id, s.id));
  await startSignerSession(s.id, s.letterId, session);
  await recomputeLetter(s.letterId);
  revalidatePath(`/l/${letter.slug}`);
  redirect(`/l/${letter.slug}/review?welcome=1`);
}

// ---------------------------------------------------------------- peer review

async function reviewContext(fd: FormData) {
  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.slug, str(fd, 'slug')));
  if (!letter) redirect('/');
  const me = await currentSigner(letter.id);
  if (!me) redirect(`/l/${letter.slug}`);
  return { d, letter, me };
}

async function isPeer(d: Awaited<ReturnType<typeof db>>, letterId: number, id: number) {
  if (!Number.isInteger(id)) return false;
  const [row] = await d
    .select({ id: signers.id })
    .from(signers)
    .where(and(eq(signers.id, id), eq(signers.letterId, letterId), eq(signers.status, 'verified')));
  return Boolean(row);
}

export async function submitAuthReview(fd: FormData) {
  const { d, letter, me } = await reviewContext(fd);
  const subjectId = Number(fd.get('subjectId'));
  const verdict = str(fd, 'verdict');
  if (subjectId !== me.id && ['real', 'fake', 'unsure'].includes(verdict) && (await isPeer(d, letter.id, subjectId))) {
    await d
      .insert(authReviews)
      .values({ letterId: letter.id, reviewerId: me.id, subjectId, verdict })
      .onConflictDoNothing();
    await recomputeLetter(letter.id);
    revalidatePath(`/l/${letter.slug}`);
  }
  redirect(`/l/${letter.slug}/review`);
}

export async function submitComparison(fd: FormData) {
  const { d, letter, me } = await reviewContext(fd);
  const x = Number(fd.get('aId'));
  const y = Number(fd.get('bId'));
  const pick = str(fd, 'pick');
  if (x !== y && x !== me.id && y !== me.id && (await isPeer(d, letter.id, x)) && (await isPeer(d, letter.id, y))) {
    const winnerId = pick === 'a' ? x : pick === 'b' ? y : null;
    await d
      .insert(comparisons)
      .values({ letterId: letter.id, reviewerId: me.id, aId: Math.min(x, y), bId: Math.max(x, y), winnerId })
      .onConflictDoNothing();
    await recomputeLetter(letter.id);
    revalidatePath(`/l/${letter.slug}`);
  }
  redirect(`/l/${letter.slug}/review`);
}

// ---------------------------------------------------------------- admin

export async function adminLogin(_prev: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  if (!rateLimit(`admin:${await clientIp()}`, 10, 10 * 60 * 1000)) return { error: 'Too many attempts. Wait a few minutes.' };
  if (!(await adminLoginWith(str(fd, 'password', 500)))) return { error: 'Wrong password.' };
  redirect('/admin');
}

export async function adminLogout() {
  await adminLogoutNow();
  redirect('/');
}

async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin');
  return db();
}

export async function saveLetter(_prev: { error?: string; saved?: boolean }, fd: FormData) {
  const d = await requireAdmin();
  const id = Number(fd.get('id') || 0);
  const slug = str(fd, 'slug', 80).toLowerCase();
  const title = str(fd, 'title', 200);
  const status = str(fd, 'status');
  if (!SLUG.test(slug)) return { error: 'The address may use lowercase letters, numbers and hyphens (2 to 80 characters).' };
  if (!title) return { error: 'A title is required.' };
  if (!['draft', 'published', 'closed'].includes(status)) return { error: 'Unknown status.' };

  const [clash] = await d.select({ id: letters.id }).from(letters).where(eq(letters.slug, slug));
  if (clash && clash.id !== id) return { error: 'Another letter already uses that address.' };

  const values = { slug, title, subtitle: str(fd, 'subtitle', 400), body: str(fd, 'body', 200000), status };
  if (id) {
    const [old] = await d.select().from(letters).where(eq(letters.id, id));
    if (!old) return { error: 'Letter not found.' };
    await d
      .update(letters)
      .set({ ...values, publishedAt: old.publishedAt ?? (status === 'published' ? new Date() : null) })
      .where(eq(letters.id, id));
    revalidatePath('/', 'layout');
    if (old.slug !== slug) redirect(`/admin/l/${id}`);
    return { saved: true };
  }
  const [row] = await d
    .insert(letters)
    .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
    .returning({ id: letters.id });
  revalidatePath('/', 'layout');
  redirect(`/admin/l/${row.id}`);
}

/** Organisers add the initial signatories directly. They are trusted and anchor the trust graph. */
export async function addSeedSigner(_prev: { error?: string; added?: string }, fd: FormData) {
  const d = await requireAdmin();
  const letterId = Number(fd.get('letterId'));
  const name = str(fd, 'name', 120);
  const email = str(fd, 'email', 254).toLowerCase();
  if (name.length < 2 || !EMAIL.test(email)) return { error: 'A name and a valid email are required.' };
  const [letter] = await d.select().from(letters).where(eq(letters.id, letterId));
  if (!letter) return { error: 'Letter not found.' };
  const values = { name, title: str(fd, 'title', 160), country: str(fd, 'country', 80), url: cleanUrl(str(fd, 'url')) };
  await d
    .insert(signers)
    .values({ letterId, email, ...values, status: 'verified', seed: true, verifiedAt: new Date() })
    .onConflictDoUpdate({
      target: [signers.letterId, signers.email],
      set: { ...values, status: 'verified', seed: true },
    });
  await recomputeLetter(letterId);
  revalidatePath('/', 'layout');
  return { added: name };
}

export async function moderateSigner(fd: FormData) {
  const d = await requireAdmin();
  const id = Number(fd.get('id'));
  const op = str(fd, 'op');
  const [s] = await d.select().from(signers).where(eq(signers.id, id));
  if (!s) return;
  const set =
    op === 'seed' ? { seed: true, status: 'verified', verifiedAt: s.verifiedAt ?? new Date() }
    : op === 'unseed' ? { seed: false }
    : op === 'remove' ? { status: 'removed', seed: false, sessionTokenHash: null, confirmed: false }
    : op === 'restore' ? { status: s.verifiedAt ? 'verified' : 'pending' }
    : null;
  if (!set) return;
  await d.update(signers).set(set).where(eq(signers.id, id));
  await recomputeLetter(s.letterId);
  revalidatePath('/', 'layout');
}

export async function recomputeNow(fd: FormData) {
  await requireAdmin();
  await recomputeLetter(Number(fd.get('letterId')));
  revalidatePath('/', 'layout');
}
