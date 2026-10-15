import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmSignature } from '@/app/actions';

export const metadata: Metadata = { title: 'Confirm your signature', robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string; invalid?: string }> };

// The link in the email lands here and the signer presses a button. Confirming
// on a plain GET would let mail scanners that pre-open links confirm signatures.
export default async function VerifyPage({ searchParams }: Props) {
  const { token, invalid } = await searchParams;
  if (invalid || !token) {
    return (
      <>
        <h1>This link has expired or was already used.</h1>
        <p>
          Sign the letter again with the same email address and we will send a fresh link. <Link href="/">See open letters</Link>.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="kicker">One last step</p>
      <h1>Confirm your signature</h1>
      <p className="lede">Press the button to add your name to the letter.</p>
      <form action={confirmSignature}>
        <input type="hidden" name="token" value={token} />
        <button type="submit">Confirm my signature</button>
      </form>
    </>
  );
}
