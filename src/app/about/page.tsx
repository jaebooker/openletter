import type { Metadata } from 'next';
import { THRESHOLDS } from '@/lib/scoring';

export const metadata: Metadata = { title: 'How verification works' };

export default function About() {
  return (
    <div className="prose">
      <p className="kicker">Method</p>
      <h1>How verification works</h1>
      <p className="lede">
        Petitions are easy to stuff with invented names. Here every signer confirms an email address, and then the
        signers check each other.
      </p>

      <h2>1. Email confirmation</h2>
      <p>
        A name appears on a letter only after its owner opens a link sent to their email address and presses a button.
        One address signs a letter once. Email addresses are never published.
      </p>

      <h2>2. Initial signatories anchor trust</h2>
      <p>
        The organisers of a letter add its initial signatories themselves. These are people they know to be real, and
        they are marked <em>Signatory</em> on the list. All trust in the system starts with them.
      </p>

      <h2>3. Signers vouch for each other</h2>
      <p>
        After signing, each person is shown other signers and asked whether this is a real person signing as themselves.
        A &ldquo;yes&rdquo; is a vouch. Trust flows from the initial signatories along those vouches and thins out with
        every step, the same way a web search engine passes reputation between pages (personalised PageRank).
      </p>
      <p>
        The consequence is the point of the design. A thousand fake accounts that vouch only for each other hold exactly
        zero trust, because no trusted signer ever vouched for one of them. They cannot confirm each other, and they
        cannot vote a real signer off the list.
      </p>

      <h2>4. Authenticity</h2>
      <p>
        Each signer&rsquo;s authenticity score is the balance of &ldquo;real&rdquo; and &ldquo;fake&rdquo; verdicts,
        each weighted by the trust of the reviewer who gave it. It runs from &minus;1 to +1.
      </p>
      <ul>
        <li>
          <strong>Peer-confirmed:</strong> at least {THRESHOLDS.minReviews} verdicts and a score of {THRESHOLDS.confirm}{' '}
          or more.
        </li>
        <li>
          <strong>Held back:</strong> at least {THRESHOLDS.minReviews} &ldquo;fake&rdquo; verdicts and a score of{' '}
          {THRESHOLDS.flag} or less. The name leaves the public list until an organiser looks at it. Organisers can
          restore or remove it.
        </li>
        <li>
          <strong>Everyone else</strong> stays on the list as email-verified, without a mark.
        </li>
      </ul>

      <h2>5. Notability sets the order</h2>
      <p>
        Reviewers are also shown two signers and asked whose signature more people would recognise. Those pairwise
        choices, again weighted by reviewer trust, are fitted with the Bradley-Terry model, the same family of method
        that produces chess ratings. The public list is sorted by the result. Order is the only thing it affects.
      </p>

      <h2>What this does not do</h2>
      <ul>
        <li>It does not prove identity. A confirmed mark means trusted fellow signers believe the signature is genuine.</li>
        <li>
          It depends on the organisers choosing honest initial signatories. A letter with none falls back to treating
          every email-verified signer equally, which is much easier to game.
        </li>
        <li>A trusted signer who vouches carelessly lends some of their trust to whoever they vouched for.</li>
      </ul>
      <p>
        The software is open source, so the exact rules, thresholds and code are public and anyone can run their own
        copy.
      </p>
    </div>
  );
}
