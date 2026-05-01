'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '../actions/auth';

const initialState: LoginState = undefined;

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-ink-soft">
        who are you?
        <select
          name="username"
          defaultValue="Tianna"
          className="cute-input mt-1"
          required
        >
          <option value="Tianna">Tianna 🍌</option>
          <option value="Isaiah">Isaiah 💌</option>
        </select>
      </label>

      <label className="text-sm font-medium text-ink-soft">
        secret password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="cute-input mt-1"
        />
      </label>

      {state?.error ? (
        <p className="text-sm text-pink-deep bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 mt-1" style={{ background: '#fff0f6', borderColor: '#ffd6e5' }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="cute-btn mt-2">
        {pending ? 'unlocking…' : 'let me in 💗'}
      </button>
    </form>
  );
}
