import { boolean, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const letters = pgTable('letters', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  body: text('body').notNull().default(''),
  /** draft | published | closed */
  status: text('status').notNull().default('draft'),
  publishedAt: ts('published_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const signers = pgTable(
  'signers',
  {
    id: serial('id').primaryKey(),
    letterId: integer('letter_id').notNull().references(() => letters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    title: text('title').notNull().default(''),
    country: text('country').notNull().default(''),
    url: text('url').notNull().default(''),
    showDomain: boolean('show_domain').notNull().default(false),
    /** pending | verified | removed */
    status: text('status').notNull().default('pending'),
    /** Trusted by the letter's organisers. Seeds anchor the trust graph. */
    seed: boolean('seed').notNull().default(false),
    verifyTokenHash: text('verify_token_hash'),
    verifyExpiresAt: ts('verify_expires_at'),
    sessionTokenHash: text('session_token_hash'),
    /** Country reported by the hosting edge (if any) when the email was confirmed. */
    geoCountry: text('geo_country').notNull().default(''),
    // Derived scores, rewritten by recomputeLetter().
    trust: real('trust').notNull().default(0),
    authenticity: real('authenticity').notNull().default(0),
    authReviews: integer('auth_reviews').notNull().default(0),
    notability: real('notability').notNull().default(0),
    confirmed: boolean('confirmed').notNull().default(false),
    flagged: boolean('flagged').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    verifiedAt: ts('verified_at'),
  },
  (t) => [
    uniqueIndex('signers_letter_email').on(t.letterId, t.email),
    index('signers_letter_status').on(t.letterId, t.status),
    index('signers_verify_token').on(t.verifyTokenHash),
  ],
);

export const authReviews = pgTable(
  'auth_reviews',
  {
    id: serial('id').primaryKey(),
    letterId: integer('letter_id').notNull().references(() => letters.id, { onDelete: 'cascade' }),
    reviewerId: integer('reviewer_id').notNull().references(() => signers.id, { onDelete: 'cascade' }),
    subjectId: integer('subject_id').notNull().references(() => signers.id, { onDelete: 'cascade' }),
    /** real | fake | unsure */
    verdict: text('verdict').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('auth_reviews_pair').on(t.reviewerId, t.subjectId), index('auth_reviews_letter').on(t.letterId)],
);

export const comparisons = pgTable(
  'comparisons',
  {
    id: serial('id').primaryKey(),
    letterId: integer('letter_id').notNull().references(() => letters.id, { onDelete: 'cascade' }),
    reviewerId: integer('reviewer_id').notNull().references(() => signers.id, { onDelete: 'cascade' }),
    /** Always the smaller signer id of the pair. */
    aId: integer('a_id').notNull().references(() => signers.id, { onDelete: 'cascade' }),
    bId: integer('b_id').notNull().references(() => signers.id, { onDelete: 'cascade' }),
    /** null means "about the same". */
    winnerId: integer('winner_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('comparisons_triple').on(t.reviewerId, t.aId, t.bId), index('comparisons_letter').on(t.letterId)],
);

export type Letter = typeof letters.$inferSelect;
export type Signer = typeof signers.$inferSelect;
