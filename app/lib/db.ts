import 'server-only';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) throw new Error('Missing TURSO_URL');
if (!authToken) throw new Error('Missing TURSO_TOKEN');

export const db = createClient({ url, authToken });

let initialized: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!initialized) {
    initialized = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS wishlist_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          link TEXT NOT NULL,
          price REAL,
          added_by TEXT NOT NULL,
          want_level INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          status TEXT NOT NULL DEFAULT 'available',
          claimed_by TEXT,
          claimed_at TEXT,
          gifted_at TEXT,
          image_url TEXT
        )
      `);

      // image_url column for tables created before the column was added
      try {
        await db.execute(`ALTER TABLE wishlist_items ADD COLUMN image_url TEXT`);
      } catch {
        // column already exists
      }

      // Persona rename migration: Nanna→Tianna, Jenel→Isaiah
      await db.execute(`UPDATE wishlist_items SET added_by = 'Tianna' WHERE added_by = 'Nanna'`);
      await db.execute(`UPDATE wishlist_items SET added_by = 'Isaiah' WHERE added_by = 'Jenel'`);
      await db.execute(`UPDATE wishlist_items SET claimed_by = 'Tianna' WHERE claimed_by = 'Nanna'`);
      await db.execute(`UPDATE wishlist_items SET claimed_by = 'Isaiah' WHERE claimed_by = 'Jenel'`);
    })();
  }
  return initialized;
}
