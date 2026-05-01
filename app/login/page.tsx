import { redirect } from 'next/navigation';
import { getCurrentUser } from '../lib/session';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="cute-card w-full max-w-md p-8 sm:p-10 float-up">
        <div className="text-center mb-7">
          <div className="text-5xl mb-2">🎀</div>
          <h1 className="font-display text-3xl font-bold text-ink">Tianna&apos;s Wishlist</h1>
          <p className="text-ink-soft text-sm mt-1">a cozy little gifting hideaway</p>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-ink-soft/70 mt-6">
          made with 💖 for Tianna &amp; Isaiah
        </p>
      </div>
    </div>
  );
}
