import Link from 'next/link';
import { logoutAction } from '../actions/auth';
import type { User } from '../lib/types';

export default function Header({ user, active }: { user: User; active: 'home' | 'add' | 'past' }) {
  const linkBase = 'cute-btn-ghost text-sm';
  const activeStyle = { background: 'rgba(255, 111, 163, 0.14)', color: 'var(--pink-deep)' };

  return (
    <header className="sticky top-0 z-10 backdrop-blur-md bg-white/55 border-b border-pink-100/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <Link href="/" className="font-display text-xl font-bold text-ink flex items-center gap-1.5 hover:wiggle">
          <span>🎀</span>
          <span>Tianna&apos;s Wishlist</span>
        </Link>
        <nav className="flex items-center gap-1 ml-auto">
          <Link href="/" className={linkBase} style={active === 'home' ? activeStyle : undefined}>
            wishlist
          </Link>
          <Link href="/add" className={linkBase} style={active === 'add' ? activeStyle : undefined}>
            + add
          </Link>
          <Link href="/past-gifts" className={linkBase} style={active === 'past' ? activeStyle : undefined}>
            past gifts 🎁
          </Link>
        </nav>
        <div className="flex items-center gap-2 pl-2 border-l border-pink-100">
          <span className="text-xs text-ink-soft hidden sm:inline">
            hi, <span className="font-semibold text-ink">{user}</span> {user === 'Tianna' ? '🍌' : '💌'}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="cute-btn-ghost text-xs">bye 👋</button>
          </form>
        </div>
      </div>
    </header>
  );
}
