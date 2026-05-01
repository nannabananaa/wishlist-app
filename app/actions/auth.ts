'use server';

import { redirect } from 'next/navigation';
import { checkCredentials } from '../lib/auth';
import { createSession, destroySession } from '../lib/session';

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const user = checkCredentials(username, password);
  if (!user) {
    return { error: 'Wrong username or password 🥲' };
  }

  await createSession(user);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
