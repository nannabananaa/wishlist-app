import Header from '../components/Header';
import ItemCard from '../components/ItemCard';
import { requireUser } from '../lib/auth';
import { listGiftedItems } from '../lib/items';

export default async function PastGiftsPage() {
  const user = await requireUser();
  const items = await listGiftedItems();

  return (
    <>
      <Header user={user} active="past" />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
          past gifts 🎁
        </h1>
        <p className="text-ink-soft text-sm mb-6">
          a little memory book of everything that&apos;s been gifted
        </p>

        {items.length === 0 ? (
          <div className="cute-card p-10 text-center">
            <div className="text-5xl mb-3">📜</div>
            <h2 className="font-display text-xl font-semibold mb-1">no gifts yet</h2>
            <p className="text-ink-soft text-sm">
              once Isaiah marks something as gifted, it&apos;ll show up here ✨
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} viewer={user} mode="past" />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
