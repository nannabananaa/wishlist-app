export type User = 'Tianna' | 'Isaiah';

export type ItemStatus = 'available' | 'claimed' | 'gifted';

export type WishlistItem = {
  id: number;
  name: string;
  link: string;
  price: number | null;
  addedBy: User;
  wantLevel: number;
  createdAt: string;
  status: ItemStatus;
  claimedBy: User | null;
  claimedAt: string | null;
  giftedAt: string | null;
  imageUrl: string | null;
};

export const WANT_LEVELS = [
  { value: 1, label: 'Meh', emoji: '😐' },
  { value: 2, label: 'Would be nice', emoji: '🙂' },
  { value: 3, label: 'Want it', emoji: '😍' },
  { value: 4, label: 'Really want it', emoji: '🤩' },
  { value: 5, label: 'NEED this', emoji: '🚨' },
] as const;

export function wantLevelLabel(level: number) {
  return WANT_LEVELS.find((l) => l.value === level) ?? WANT_LEVELS[2];
}
