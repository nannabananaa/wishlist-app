import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from './session';
import type { User } from './types';

export function checkCredentials(user: string, password: string): User | null {
  if (user === 'Tianna' && password === process.env.TIANNA_PASSWORD) return 'Tianna';
  if (user === 'Isaiah' && password === process.env.ISAIAH_PASSWORD) return 'Isaiah';
  return null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
