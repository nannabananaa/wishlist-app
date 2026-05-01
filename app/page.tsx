import Link from 'next/link';
import Header from './components/Header';
import ItemCard from './components/ItemCard';
import { requireUser } from './lib/auth';
import { listActiveItems, type ListFilters } from './lib/items';
import type { User } from './lib/types';

type SearchParams = Promise<{ added_by?: string; sort?: string }>;

const SORT_OPTIONS: { value: NonNullable<ListFilters['sort']>; label: string }[] = [
  { value: 'newest', label: 'newest first' },
  { value: 'oldest', label: 'oldest first' },
  { value: 'price-low', label: 'price: low → high' },
  { value: 'price-high', label: 'price: high → low' },
  { value: 'want-high', label: 'want: high → low' },
  { value: 'want-low', label: 'want: low → high' },
];

function parseFilters(sp: { added_by?: string; sort?: string }): ListFilters {
  const addedBy =
    sp.added_by === 'Tianna' || sp.added_by === 'Isaiah' ? (sp.added_by as User) : 'all';
  const validSorts = SORT_OPTIONS.map((s) => s.value);
  const sort = (validSorts as string[]).includes(sp.sort ?? '')
    ? (sp.sort as ListFilters['sort'])
    : 'newest';
  return { addedBy, sort };
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const items = await listActiveItems(user, filters);

  const filterChip = (key: 'added_by' | 'sort', value: string, label: string, current: string) => {
    const params = new URLSearchParams();
    if (filters.addedBy && filters.addedBy !== 'all') params.set('added_by', filters.addedBy);
    if (filters.sort) params.set('sort', filters.sort);
    params.set(key, value);
    const isActive = current === value;
    return (
      <Link
        key={`${key}-${value}`}
        href={`/?${params.toString()}`}
        className="cute-btn-ghost text-xs"
        style={
          isActive
            ? { background: 'var(--pink)', color: 'white', fontWeight: 600 }
            : undefined
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <>
      <Header user={user} active="home" />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold">
              The wishlist 💖
            </h1>
            <p className="text-ink-soft text-sm mt-1">
              {user === 'Tianna'
                ? 'all your dreamy little wants in one place'
                : 'pssst — claim items secretly, only you can see those 🤫'}
            </p>
          </div>
          <Link href="/add" className="cute-btn">+ add a wish</Link>
        </div>

        <div className="cute-card p-4 mb-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide font-semibold text-ink-soft mb-2">
                added by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filterChip('added_by', 'all', 'everyone', filters.addedBy ?? 'all')}
                {filterChip('added_by', 'Tianna', '🍌 Tianna', filters.addedBy ?? 'all')}
                {filterChip('added_by', 'Isaiah', '💌 Isaiah', filters.addedBy ?? 'all')}
              </div>
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs uppercase tracking-wide font-semibold text-ink-soft mb-2">
                sort by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map((opt) => filterChip('sort', opt.value, opt.label, filters.sort ?? 'newest'))}
              </div>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="cute-card p-10 text-center">
            <div className="text-5xl mb-3">🌸</div>
            <h2 className="font-display text-xl font-semibold mb-1">empty wishlist!</h2>
            <p className="text-ink-soft text-sm mb-4">
              add the first thing you&apos;ve been eyeing 👀
            </p>
            <Link href="/add" className="cute-btn inline-block">+ add a wish</Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} viewer={user} mode="active" />
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-ink-soft/60 py-6">
        🎀 made with love
      </footer>
    </>
  );
}
