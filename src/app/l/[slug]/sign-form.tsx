'use client';

import { useActionState } from 'react';
import { signLetter, type SignState } from '@/app/actions';

export function SignForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<SignState, FormData>(signLetter, {});

  if (state.ok) {
    return (
      <div role="status">
        <p>
          <strong>Check your inbox.</strong> We sent a confirmation link{state.email ? ` to ${state.email}` : ''}. Your
          name appears on the letter once you open it.
        </p>
        {state.devLink && (
          <p className="notice">
            Email is not configured on this server, so here is the link: <a href={state.devLink}>{state.devLink}</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="slug" value={slug} />
      <div className="hp" aria-hidden="true">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="row">
        <label>
          Full name
          <input type="text" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label>
          Email (never shown publicly)
          <input type="email" name="email" required maxLength={254} autoComplete="email" />
        </label>
      </div>
      <div className="row">
        <label>
          Role and affiliation (optional)
          <input type="text" name="title" maxLength={160} placeholder="Professor of Law, Example University" />
        </label>
        <label>
          Country (optional)
          <input type="text" name="country" maxLength={80} autoComplete="country-name" />
        </label>
      </div>
      <label>
        A public page that shows who you are (optional)
        <input type="text" name="url" maxLength={300} inputMode="url" placeholder="Staff page, personal site or social profile" />
      </label>
      <label className="check">
        <input type="checkbox" name="showDomain" />
        <span>Let reviewers see my email domain (for example @university.edu) as evidence that I am who I say.</span>
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Sign and confirm by email'}
        </button>
        <small className="sans">Your name, role and country are shown publicly and to fellow signers who review the list.</small>
      </div>
    </form>
  );
}
