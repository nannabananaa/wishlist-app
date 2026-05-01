import 'server-only';
import { db, ensureSchema } from './db';
import type { ItemStatus, User, WishlistItem } from './types';

type Row = {
  id: number;
  name: string;
  link: string;
  price: number | null;
  added_by: string;
  want_level: number;
  created_at: string;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
  gifted_at: string | null;
  image_url: string | null;
};

function rowToItem(r: Row): WishlistItem {
  return {
    id: r.id,
    name: r.name,
    link: r.link,
    price: r.price,
    addedBy: r.added_by as User,
    wantLevel: r.want_level,
    createdAt: r.created_at,
    status: r.status as ItemStatus,
    claimedBy: (r.claimed_by ?? null) as User | null,
    claimedAt: r.claimed_at,
    giftedAt: r.gifted_at,
    imageUrl: r.image_url,
  };
}

export type ListFilters = {
  addedBy?: User | 'all';
  sort?: 'newest' | 'oldest' | 'price-low' | 'price-high' | 'want-high' | 'want-low';
};

export async function listActiveItems(viewer: User, filters: ListFilters = {}): Promise<WishlistItem[]> {
  await ensureSchema();

  // Status filter: Tianna only sees available; Isaiah sees available + claimed (but not gifted).
  const statusClause = viewer === 'Tianna' ? "status = 'available'" : "status IN ('available', 'claimed')";

  const args: (string | number)[] = [];
  let where = statusClause;
  if (filters.addedBy && filters.addedBy !== 'all') {
    where += ' AND added_by = ?';
    args.push(filters.addedBy);
  }

  let orderBy = 'created_at DESC';
  switch (filters.sort) {
    case 'oldest':
      orderBy = 'created_at ASC';
      break;
    case 'price-low':
      orderBy = 'price IS NULL, price ASC, created_at DESC';
      break;
    case 'price-high':
      orderBy = 'price IS NULL, price DESC, created_at DESC';
      break;
    case 'want-high':
      orderBy = 'want_level DESC, created_at DESC';
      break;
    case 'want-low':
      orderBy = 'want_level ASC, created_at DESC';
      break;
    case 'newest':
    default:
      orderBy = 'created_at DESC';
  }

  const result = await db.execute({
    sql: `SELECT * FROM wishlist_items WHERE ${where} ORDER BY ${orderBy}`,
    args,
  });

  return result.rows.map((r) => rowToItem(r as unknown as Row));
}

export async function listGiftedItems(): Promise<WishlistItem[]> {
  await ensureSchema();
  const result = await db.execute(
    `SELECT * FROM wishlist_items WHERE status = 'gifted' ORDER BY gifted_at DESC`
  );
  return result.rows.map((r) => rowToItem(r as unknown as Row));
}

export async function insertItem(input: {
  name: string;
  link: string;
  price: number | null;
  addedBy: User;
  wantLevel: number;
  imageUrl: string | null;
}): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `INSERT INTO wishlist_items (name, link, price, added_by, want_level, image_url)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [input.name, input.link, input.price, input.addedBy, input.wantLevel, input.imageUrl],
  });
}

export async function updateItem(
  id: number,
  requester: User,
  input: {
    name: string;
    link: string;
    price: number | null;
    wantLevel: number;
    imageUrl: string | null;
    clearImage: boolean;
  }
): Promise<void> {
  await ensureSchema();
  if (input.clearImage) {
    await db.execute({
      sql: `UPDATE wishlist_items
            SET name = ?, link = ?, price = ?, want_level = ?, image_url = NULL
            WHERE id = ? AND added_by = ? AND status != 'gifted'`,
      args: [input.name, input.link, input.price, input.wantLevel, id, requester],
    });
  } else if (input.imageUrl !== null) {
    await db.execute({
      sql: `UPDATE wishlist_items
            SET name = ?, link = ?, price = ?, want_level = ?, image_url = ?
            WHERE id = ? AND added_by = ? AND status != 'gifted'`,
      args: [input.name, input.link, input.price, input.wantLevel, input.imageUrl, id, requester],
    });
  } else {
    await db.execute({
      sql: `UPDATE wishlist_items
            SET name = ?, link = ?, price = ?, want_level = ?
            WHERE id = ? AND added_by = ? AND status != 'gifted'`,
      args: [input.name, input.link, input.price, input.wantLevel, id, requester],
    });
  }
}

export async function getItem(id: number): Promise<WishlistItem | null> {
  await ensureSchema();
  const result = await db.execute({
    sql: 'SELECT * FROM wishlist_items WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToItem(result.rows[0] as unknown as Row);
}

export async function claimItem(id: number, claimer: User): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `UPDATE wishlist_items
          SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now')
          WHERE id = ? AND status = 'available'`,
    args: [claimer, id],
  });
}

export async function unclaimItem(id: number, claimer: User): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `UPDATE wishlist_items
          SET status = 'available', claimed_by = NULL, claimed_at = NULL
          WHERE id = ? AND status = 'claimed' AND claimed_by = ?`,
    args: [id, claimer],
  });
}

export async function giftItem(id: number, claimer: User): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `UPDATE wishlist_items
          SET status = 'gifted', gifted_at = datetime('now')
          WHERE id = ? AND status = 'claimed' AND claimed_by = ?`,
    args: [id, claimer],
  });
}

export async function deleteItem(id: number, requester: User): Promise<void> {
  await ensureSchema();
  await db.execute({
    sql: `DELETE FROM wishlist_items WHERE id = ? AND added_by = ? AND status != 'gifted'`,
    args: [id, requester],
  });
}
