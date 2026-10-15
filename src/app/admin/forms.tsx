'use client';

import { useActionState } from 'react';
import { addSeedSigner, adminLogin, saveLetter } from '@/app/actions';
import type { Letter } from '@/db/schema';

export function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, {});
  return (
    <form action={action} className="stack card">
      <label>
        Organiser password
        <input type="password" name="password" required autoComplete="current-password" />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <button disabled={pending}>Sign in</button>
      </div>
    </form>
  );
}

export function LetterForm({ letter }: { letter?: Letter }) {
  const [state, action, pending] = useActionState<{ error?: string; saved?: boolean }, FormData>(saveLetter, {});
  return (
    <form action={action} className="stack card">
      {letter && <input type="hidden" name="id" value={letter.id} />}
      <label>
        Title
        <input type="text" name="title" required maxLength={200} defaultValue={letter?.title} />
      </label>
      <label>
        Subtitle
        <input type="text" name="subtitle" maxLength={400} defaultValue={letter?.subtitle} />
      </label>
      <div className="row">
        <label>
          Address: /l/…
          <input type="text" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,79}" defaultValue={letter?.slug} placeholder="my-letter" />
        </label>
        <label>
          Status
          <select name="status" defaultValue={letter?.status ?? 'draft'}>
            <option value="draft">Draft (organisers only)</option>
            <option value="published">Published (open for signatures)</option>
            <option value="closed">Closed (visible, no new signatures)</option>
          </select>
        </label>
      </div>
      <label>
        Text (Markdown)
        <textarea name="body" defaultValue={letter?.body} />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button disabled={pending}>{letter ? 'Save letter' : 'Create letter'}</button>
        {state.saved && <small className="sans">Saved.</small>}
      </div>
    </form>
  );
}

export function SeedForm({ letterId }: { letterId: number }) {
  const [state, action, pending] = useActionState<{ error?: string; added?: string }, FormData>(addSeedSigner, {});
  return (
    <form action={action} className="stack card" key={state.added}>
      <input type="hidden" name="letterId" value={letterId} />
      <div className="row">
        <label>
          Full name
          <input type="text" name="name" required maxLength={120} />
        </label>
        <label>
          Email
          <input type="email" name="email" required maxLength={254} />
        </label>
      </div>
      <div className="row">
        <label>
          Role and affiliation
          <input type="text" name="title" maxLength={160} />
        </label>
        <label>
          Country
          <input type="text" name="country" maxLength={80} />
        </label>
      </div>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button disabled={pending}>Add initial signatory</button>
        {state.added && <small className="sans">Added {state.added}.</small>}
      </div>
    </form>
  );
}
