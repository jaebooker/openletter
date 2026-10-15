import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { letters, signers } from '@/db/schema';

export const dynamic = 'force-dynamic';

// Quote every cell, and defuse spreadsheet formula injection.
const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.slug, (await params).slug));
  if (!letter || letter.status === 'draft') return new Response('Not found', { status: 404 });
  const rows = await d
    .select()
    .from(signers)
    .where(and(eq(signers.letterId, letter.id), eq(signers.status, 'verified'), eq(signers.flagged, false)))
    .orderBy(desc(signers.notability), asc(signers.verifiedAt));
  const lines = [
    'name,role,country,standing,signed_at',
    ...rows.map((s) =>
      [
        cell(s.name),
        cell(s.title),
        cell(s.country),
        s.seed ? 'signatory' : s.confirmed ? 'peer-confirmed' : 'email-verified',
        s.verifiedAt?.toISOString() ?? '',
      ].join(','),
    ),
  ];
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${letter.slug}-signers.csv"`,
    },
  });
}
