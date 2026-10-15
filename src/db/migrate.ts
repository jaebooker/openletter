/**
 * Idempotent schema bootstrap, run once per process on first database use.
 * Keep in sync with schema.ts. Add new columns with ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS letters (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS signers (
  id serial PRIMARY KEY,
  letter_id integer NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  title text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  show_domain boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  seed boolean NOT NULL DEFAULT false,
  verify_token_hash text,
  verify_expires_at timestamptz,
  session_token_hash text,
  geo_country text NOT NULL DEFAULT '',
  trust real NOT NULL DEFAULT 0,
  authenticity real NOT NULL DEFAULT 0,
  auth_reviews integer NOT NULL DEFAULT 0,
  notability real NOT NULL DEFAULT 0,
  confirmed boolean NOT NULL DEFAULT false,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS signers_letter_email ON signers (letter_id, email);
CREATE INDEX IF NOT EXISTS signers_letter_status ON signers (letter_id, status);
CREATE INDEX IF NOT EXISTS signers_verify_token ON signers (verify_token_hash);
CREATE TABLE IF NOT EXISTS auth_reviews (
  id serial PRIMARY KEY,
  letter_id integer NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  reviewer_id integer NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  subject_id integer NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_reviews_pair ON auth_reviews (reviewer_id, subject_id);
CREATE INDEX IF NOT EXISTS auth_reviews_letter ON auth_reviews (letter_id);
CREATE TABLE IF NOT EXISTS comparisons (
  id serial PRIMARY KEY,
  letter_id integer NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  reviewer_id integer NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  a_id integer NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  b_id integer NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
  winner_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comparisons_triple ON comparisons (reviewer_id, a_id, b_id);
CREATE INDEX IF NOT EXISTS comparisons_letter ON comparisons (letter_id);
`;
