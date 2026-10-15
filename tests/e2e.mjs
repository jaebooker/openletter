// End-to-end check of the whole flow against a running server.
//   npm run seed && SHOW_VERIFY_LINKS=1 ADMIN_PASSWORD=test-pass npm start
//   BASE=http://localhost:3000 ADMIN_PASSWORD=test-pass npm run e2e
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'test-pass';
const SLUG = 'open-research-demo';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const step = (name) => console.log(`ok  ${name}`);
const tally = async (page) => Number((await page.locator('.tally strong').innerText()).replace(/,/g, ''));

try {
  // --- a visitor reads and signs
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE);
  await page.getByRole('link', { name: 'Public Research Should Be Public' }).click();
  await page.waitForURL(`**/l/${SLUG}`);
  const before = await tally(page);
  assert.ok(before >= 5, 'demo letter has signatures');
  assert.equal(await page.getByText('Albert Einstien').count(), 0, 'held-back fakes are not on the public list');
  await page.screenshot({ path: `${SHOTS}letter.png`, fullPage: true });
  step(`letter page renders with ${before} signatures and hides the fake ring`);

  const name = `Eve Tester ${Date.now() % 100000}`;
  const email = `eve${Date.now()}@example.com`;
  await page.getByLabel('Full name').fill('E');
  await page.getByLabel('Email (never shown publicly)').fill(email);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Role and affiliation (optional)').fill('QA Engineer, Example Labs');
  await page.getByLabel('Country (optional)').fill('Ireland');
  await page.getByRole('button', { name: 'Sign and confirm by email' }).click();
  await page.getByText('Check your inbox.').waitFor();
  const link = await page.locator('.notice a').getAttribute('href');
  assert.match(link, /\/verify\?token=/);
  step('signing sends a confirmation link');

  await page.goto(`${BASE}/l/${SLUG}`);
  assert.equal(await tally(page), before, 'unconfirmed signature is not counted');
  assert.equal(await page.getByText(name).count(), 0);
  step('unconfirmed signature is not shown');

  await page.goto(link);
  assert.equal(await page.getByText(name).count(), 0, 'opening the link alone confirms nothing');
  await page.getByRole('button', { name: 'Confirm my signature' }).click();
  await page.waitForURL(`**/l/${SLUG}/review?welcome=1`);
  await page.getByRole('heading', { name: /Your signature is confirmed/ }).waitFor();
  await page.screenshot({ path: `${SHOTS}review.png`, fullPage: true });
  step('confirming lands on peer review');

  let auth = 0;
  let pairs = 0;
  for (let i = 0; i < 6; i++) {
    const isPair = (await page.locator('.versus').count()) > 0;
    if (isPair) {
      if (pairs === 0) await page.screenshot({ path: `${SHOTS}review-pair.png`, fullPage: true });
      pairs++;
      await page.locator('.versus button').first().click();
    } else {
      auth++;
      await page.getByRole('button', { name: 'Yes, looks genuine' }).click();
    }
    await page.getByText(`You have made ${i + 1} review`).waitFor();
  }
  assert.ok(auth >= 2 && pairs >= 2, `both review kinds are served (auth ${auth}, pairs ${pairs})`);
  step(`six reviews recorded (${auth} authenticity, ${pairs} pairwise)`);

  await page.goto(`${BASE}/l/${SLUG}`);
  assert.equal(await tally(page), before + 1);
  await page.locator('.signers .who', { hasText: name }).waitFor();
  await page.getByRole('heading', { name: `You signed this letter, ${name}.` }).waitFor();
  step('signature is public and counted');

  await page.goto(link);
  await page.getByRole('button', { name: 'Confirm my signature' }).click();
  await page.getByRole('heading', { name: /expired or was already used/ }).waitFor();
  step('confirmation link is single-use');

  const csv = await (await ctx.request.get(`${BASE}/l/${SLUG}/signers.csv`)).text();
  assert.ok(csv.includes(name) && !csv.includes('@example'), 'CSV has names and no email addresses');
  assert.ok(!csv.includes('Einstien'));
  step('CSV export lists public signers without emails');

  // --- an organiser manages letters
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ap = await admin.newPage();
  ap.on('pageerror', (e) => errors.push(String(e)));
  await ap.goto(`${BASE}/admin`);
  await ap.getByLabel('Organiser password').fill('wrong');
  await ap.getByRole('button', { name: 'Sign in' }).click();
  await ap.getByText('Wrong password.').waitFor();
  await ap.getByLabel('Organiser password').fill(PASSWORD);
  await ap.getByRole('button', { name: 'Sign in' }).click();
  await ap.getByRole('heading', { name: 'Letters' }).waitFor();
  step('organiser sign-in rejects a wrong password and accepts the right one');

  const slug = `e2e-${Date.now()}`;
  await ap.getByLabel('Title', { exact: true }).fill('E2E Draft Letter');
  await ap.getByLabel('Address: /l/…').fill(slug);
  await ap.getByLabel('Text (Markdown)').fill('A **bold** claim.\n\n<script>window.pwned = 1</script>');
  await ap.getByRole('button', { name: 'Create letter' }).click();
  await ap.waitForURL('**/admin/l/*');
  const anon = await ctx.request.get(`${BASE}/l/${slug}`);
  assert.equal(anon.status(), 404, 'drafts are hidden from the public');
  step('draft letter is hidden from the public');

  const seedForm = ap.locator('form', { has: ap.getByRole('button', { name: 'Add initial signatory' }) });
  await seedForm.getByLabel('Full name').fill('Ada Anchor');
  await seedForm.getByLabel('Email').fill('ada@example.org');
  await seedForm.getByRole('button', { name: 'Add initial signatory' }).click();
  await ap.getByText('Added Ada Anchor.').waitFor();
  await ap.getByLabel('Status').selectOption('published');
  await ap.getByRole('button', { name: 'Save letter' }).click();
  await ap.getByText('Saved.').waitFor();
  await page.goto(`${BASE}/l/${slug}`);
  assert.equal(await tally(page), 1);
  await page.getByText('Ada Anchor').waitFor();
  assert.equal(await page.locator('.prose strong').innerText(), 'bold');
  assert.equal(await page.evaluate(() => window.pwned), undefined, 'raw HTML in letter text is not executed');
  step('published letter shows its initial signatory and renders Markdown safely');

  // --- moderation on the demo letter
  await ap.goto(`${BASE}/admin`);
  await ap.getByRole('link', { name: 'Public Research Should Be Public' }).click();
  await ap.getByText('Held back').first().waitFor();
  await ap.screenshot({ path: `${SHOTS}admin.png`, fullPage: true });
  const row = ap.locator('tr', { hasText: name });
  await row.getByRole('button', { name: 'Remove' }).click();
  await row.getByRole('button', { name: 'Restore' }).waitFor();
  await page.goto(`${BASE}/l/${SLUG}`);
  assert.equal(await tally(page), before);
  assert.equal(await page.getByText(name).count(), 0);
  await page.goto(`${BASE}/l/${SLUG}/review`);
  await page.waitForURL(`**/l/${SLUG}#sign`);
  step('removing a signer takes them off the letter and ends their review access');

  const noAdmin = await ctx.request.get(`${BASE}/admin/l/1`, { maxRedirects: 0 });
  assert.ok([307, 303, 302].includes(noAdmin.status()), 'organiser pages redirect without a session');
  step('organiser pages are closed to the public');

  // --- small screens
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const pp = await phone.newPage();
  for (const path of ['/', `/l/${SLUG}`, '/about']) {
    await pp.goto(BASE + path);
    const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${path} scrolls sideways by ${overflow}px on a phone`);
  }
  await pp.goto(`${BASE}/l/${SLUG}`);
  await pp.screenshot({ path: `${SHOTS}phone.png` });
  step('no sideways scroll at phone width');

  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('\nAll end-to-end checks passed.');
} finally {
  await browser.close();
}
