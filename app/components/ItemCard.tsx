import Link from 'next/link';
import { claimItemAction, deleteItemAction, giftItemAction, unclaimItemAction } from '../actions/items';
import type { User, WishlistItem } from '../lib/types';
import { wantLevelLabel } from '../lib/types';

const wantStyle: Record<number, { bg: string; color: string }> = {
  1: { bg: '#f0e7f5', color: '#7a5b8e' },
  2: { bg: '#e6f0ff', color: '#3d6bb3' },
  3: { bg: '#fff0db', color: '#b8721e' },
  4: { bg: '#ffe1ec', color: '#c93770' },
  5: { bg: '#ffd6d6', color: '#c43030' },
};

function formatDate(iso: string) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPrice(p: number | null) {
  if (p === null) return '—';
  return p.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function hostname(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

export default function ItemCard({ item, viewer, mode }: {
  item: WishlistItem;
  viewer: User;
  mode: 'active' | 'past';
}) {
  const want = wantLevelLabel(item.wantLevel);
  const ws = wantStyle[item.wantLevel];
  const isClaimed = item.status === 'claimed';
  const isGifted = item.status === 'gifted';
  const canDelete = !isGifted && item.addedBy === viewer && !(isClaimed && viewer === 'Tianna');
  const canEdit = !isGifted && item.addedBy === viewer && mode === 'active';

  return (
    <div
      className="cute-card p-5 float-up"
      style={isClaimed ? { borderColor: 'rgba(168, 232, 200, 0.6)', background: 'linear-gradient(180deg, #f4fff8 0%, #ffffff 60%)' } : undefined}
    >
      <div className="flex items-start gap-3">
        {item.imageUrl ? (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label={`open ${item.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl border border-pink-100"
            />
          </a>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="want-pill" style={{ background: ws.bg, color: ws.color }}>
              {want.emoji} {want.label}
            </span>
            {isClaimed && viewer === 'Isaiah' ? (
              <span className="want-pill" style={{ background: '#dcf5e6', color: '#2e7a4e' }}>
                🤫 secretly claimed
              </span>
            ) : null}
            {isGifted ? (
              <span className="want-pill" style={{ background: '#fff0db', color: '#b8721e' }}>
                🎁 gifted
              </span>
            ) : null}
          </div>
          <h3 className="font-display text-xl font-bold text-ink leading-snug break-words">
            {item.name}
          </h3>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pink-deep hover:underline break-all inline-block mt-1"
          >
            {hostname(item.link)} ↗
          </a>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold text-ink">
            {formatPrice(item.price)}
          </div>
          <div className="text-xs text-ink-soft mt-0.5">
            {item.addedBy === 'Tianna' ? '🍌 Tianna' : '💌 Isaiah'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-pink-50">
        <div className="text-xs text-ink-soft">
          {mode === 'past' && item.giftedAt
            ? `gifted ${formatDate(item.giftedAt)}`
            : `added ${formatDate(item.createdAt)}`}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'active' && viewer === 'Isaiah' && !isClaimed ? (
            <form action={claimItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="cute-btn-soft" title="Only you can see this">
                🤫 claim
              </button>
            </form>
          ) : null}

          {mode === 'active' && viewer === 'Isaiah' && isClaimed && item.claimedBy === 'Isaiah' ? (
            <>
              <form action={unclaimItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="cute-btn-ghost">unclaim</button>
              </form>
              <form action={giftItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="cute-btn">🎁 mark gifted</button>
              </form>
            </>
          ) : null}

          {canEdit ? (
            <Link href={`/edit/${item.id}`} className="cute-btn-ghost" aria-label="edit">
              ✏️
            </Link>
          ) : null}

          {canDelete && mode === 'active' ? (
            <form action={deleteItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="cute-btn-ghost" aria-label="delete">
                🗑️
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
