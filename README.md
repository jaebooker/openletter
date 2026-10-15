# Countersign

Open source software for open letters whose signatures are verified by the people who sign them. An independent, from-scratch take on the model used by [openletter.net](https://openletter.net/). Not affiliated with it.

- **Email-confirmed signing.** A name appears only after its owner opens an emailed link and presses a button.
- **Peer review.** Each signer is asked to check others: is this a real person, and which of these two is better known?
- **Trust graph.** Judgements are weighted by trust that flows from the letter's initial signatories. Fake accounts that vouch only for each other hold zero trust.
- **Self-sorting list.** Confirmed signers are marked, suspect ones are held back for organisers, and the list is ordered by notability.
- **Organiser pages.** Write letters in Markdown, add initial signatories, moderate signers, export CSV.

## Run it

```bash
npm install
cp .env.example .env.local      # set ADMIN_PASSWORD
npm run seed                    # optional: a demo letter with 35 invented signers
npm run dev
```

Open http://localhost:3000. Organiser pages are at `/admin`.

With no `DATABASE_URL` the app uses an embedded Postgres (PGlite) stored in `./.data`. With no `SMTP_URL` the confirmation link is shown in the browser and printed to the server log, in development only.

## Deploy

**Any Node host or Vercel.** Set `DATABASE_URL` (any Postgres), `ADMIN_PASSWORD`, `SITE_URL`, `SMTP_URL` and `MAIL_FROM`, then `npm run build && npm start`. Tables are created on first use.

**Docker.** `ADMIN_PASSWORD=... docker compose up --build` starts the app with its own Postgres.

Settings are listed in [.env.example](.env.example).

## How verification works

All of it lives in [`src/lib/scoring.ts`](src/lib/scoring.ts): about 150 lines of pure functions with tests.

1. **Trust** (`trustScores`). Personalised PageRank over "this person is real" vouches, restarting at the seed signers. Trust thins with each step away from a seed. Accounts no trusted signer has vouched for get exactly 0.
2. **Authenticity** (`authenticityScores`). For each signer, `(real - fake) / (real + fake + 0.5)` where each verdict counts for its reviewer's trust. Range -1 to +1.
   - *Peer-confirmed:* 2 or more verdicts and a score of at least 0.3.
   - *Held back:* 2 or more "fake" verdicts and a score of -0.3 or less. Hidden from the public list until an organiser restores or removes the signer.
3. **Notability** (`bradleyTerry`). Pairwise "who is better known" choices, weighted by reviewer trust, fitted with the Bradley-Terry model. It sets the order of the list and nothing else.

Thresholds are in `THRESHOLDS` at the top of that file. Scores are recalculated after every review (`src/lib/recompute.ts`).

**Add initial signatories before publishing.** With none, every email-verified signer gets an equal voice, and the Sybil resistance is gone.

## Limits

- A confirmed mark means trusted fellow signers believe the signature is genuine. It is not proof of identity.
- There is no linked social account check and no real location check. The app records the country reported by Vercel or Cloudflare at confirmation time and shows it to organisers only.
- A careless trusted signer passes some of their trust to whoever they vouch for.
- The rate limiter is in-memory and per-process. Put a real one in front for a large campaign.
- Scores are recalculated in full after each review. That is fine for thousands of signers. Beyond that, move `recomputeLetter` to a scheduled job.
- One shared organiser password. No per-organiser accounts yet.

## Develop

```bash
npm test          # scoring engine unit tests
npm run typecheck
npm run e2e       # browser test of the whole flow; see the header of tests/e2e.mjs
```

```
src/db/          schema and database bootstrap (Postgres or embedded PGlite)
src/lib/         scoring engine, score recalculation, sessions, mail
src/app/         pages and server actions (Next.js App Router)
scripts/seed.ts  demo data, including a ring of fake accounts
```

## Licence

MIT
