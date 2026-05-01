import { createServer } from 'node:http';
import { readFile, readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@libsql/client';

// Load .env.local for local dev. Production hosts inject env vars directly.
try {
  const text = readFileSync('.env.local', 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
} catch {}

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const COOKIE_NAME = 'wishlist_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// ---------- Database ----------
let _db;
function db() {
  if (_db) return _db;
  const url = process.env.TURSO_URL;
  // Accept either name — production uses TURSO_AUTH_TOKEN, older local .env may have TURSO_TOKEN.
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;
  if (!url) throw new Error('Missing TURSO_URL');
  if (!authToken) throw new Error('Missing TURSO_AUTH_TOKEN');
  _db = createClient({ url, authToken });
  return _db;
}

let schemaReady;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db().execute(`
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
      try {
        await db().execute(`ALTER TABLE wishlist_items ADD COLUMN image_url TEXT`);
      } catch {}
    })();
  }
  return schemaReady;
}

// ---------- Sessions ----------
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('Missing SESSION_SECRET');
  return s;
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function encodeToken(user) {
  const payload = Buffer.from(user).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decodeToken(token) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const user = Buffer.from(payload, 'base64url').toString('utf-8');
  if (user !== 'Tianna' && user !== 'Isaiah') return null;
  return user;
}

function getUser(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  return decodeToken(decodeURIComponent(m[1]));
}

function setSession(res, user) {
  const value = encodeToken(user);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

// ---------- Body parsing ----------
async function readBody(req, max = 8 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > max) {
      const e = new Error('Payload too large');
      e.code = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const e = new Error('Invalid JSON');
    e.code = 400;
    throw e;
  }
}

// ---------- Response helpers ----------
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const sendJson = (res, status, body) => send(res, status, body);
const sendErr = (res, status, msg) => sendJson(res, status, { error: msg });

// ---------- Static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (!extname(rel)) rel = rel + '.html';
  const safe = resolve(join(PUBLIC_DIR, rel));
  if (!safe.startsWith(PUBLIC_DIR + sep) && safe !== PUBLIC_DIR) {
    return send(res, 404, 'Not Found', 'text/plain');
  }
  try {
    const data = await readFileAsync(safe);
    const ext = extname(safe).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  } catch {
    send(res, 404, 'Not Found', 'text/plain');
  }
}

// ---------- Item helpers ----------
function toItem(r, viewer) {
  return {
    id: Number(r.id),
    name: r.name,
    link: r.link,
    price: r.price == null ? null : Number(r.price),
    addedBy: r.added_by,
    wantLevel: Number(r.want_level),
    createdAt: r.created_at,
    status: r.status,
    // Hide claimed_by from Tianna so the surprise stays a surprise.
    claimedBy: viewer === 'Tianna' ? null : r.claimed_by,
    claimedAt: r.claimed_at,
    giftedAt: r.gifted_at,
    imageUrl: r.image_url,
  };
}

function validImage(s) {
  if (s == null || s === '') return null;
  if (typeof s !== 'string') return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 7 * 1024 * 1024) return null;
  return s;
}

function parseId(s) {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateItemInput(body) {
  const name = String(body.name ?? '').trim();
  const link = String(body.link ?? '').trim();
  const wantLevel = Number(body.wantLevel);
  if (!name) return { error: 'Name required' };
  if (!link) return { error: 'Link required' };
  try {
    const u = new URL(link);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Invalid link' };
  } catch {
    return { error: 'Invalid link' };
  }
  if (!Number.isInteger(wantLevel) || wantLevel < 1 || wantLevel > 5) {
    return { error: 'Want level must be 1-5' };
  }
  let price = null;
  if (body.price !== '' && body.price != null) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'Invalid price' };
  }
  return { name, link, wantLevel, price };
}

// ---------- API: auth ----------
async function apiLogin(req, res) {
  const { user, password } = await readJson(req);
  let ok = false;
  // Accept either persona env var name for backwards-compat with older .env files.
  const tiannaPw = process.env.TIANNA_PASSWORD || process.env.NANNA_PASSWORD;
  const isaiahPw = process.env.ISAIAH_PASSWORD || process.env.JENEL_PASSWORD;
  if (user === 'Tianna' && password && password === tiannaPw) ok = true;
  if (user === 'Isaiah' && password && password === isaiahPw) ok = true;
  if (!ok) return sendErr(res, 401, 'Invalid credentials');
  setSession(res, user);
  sendJson(res, 200, { user });
}

async function apiLogout(_req, res) {
  clearSession(res);
  sendJson(res, 200, { ok: true });
}

async function apiMe(req, res) {
  const user = getUser(req);
  if (!user) return sendErr(res, 401, 'Not authenticated');
  sendJson(res, 200, { user });
}

// ---------- API: items ----------
async function apiListActive(_req, res, viewer, url) {
  await ensureSchema();
  const addedBy = url.searchParams.get('addedBy') || 'all';
  const sort = url.searchParams.get('sort') || 'newest';

  const statusClause =
    viewer === 'Tianna' ? "status = 'available'" : "status IN ('available', 'claimed')";
  const args = [];
  let where = statusClause;
  if (addedBy === 'Tianna' || addedBy === 'Isaiah') {
    where += ' AND added_by = ?';
    args.push(addedBy);
  }
  let orderBy;
  switch (sort) {
    case 'oldest': orderBy = 'created_at ASC'; break;
    case 'price-low': orderBy = 'price IS NULL, price ASC, created_at DESC'; break;
    case 'price-high': orderBy = 'price IS NULL, price DESC, created_at DESC'; break;
    case 'want-high': orderBy = 'want_level DESC, created_at DESC'; break;
    case 'want-low': orderBy = 'want_level ASC, created_at DESC'; break;
    default: orderBy = 'created_at DESC';
  }

  const result = await db().execute({
    sql: `SELECT * FROM wishlist_items WHERE ${where} ORDER BY ${orderBy}`,
    args,
  });
  sendJson(res, 200, result.rows.map((r) => toItem(r, viewer)));
}

async function apiListGifted(_req, res, viewer) {
  await ensureSchema();
  const result = await db().execute(
    `SELECT * FROM wishlist_items WHERE status = 'gifted' ORDER BY gifted_at DESC`
  );
  sendJson(res, 200, result.rows.map((r) => toItem(r, viewer)));
}

async function apiCreate(req, res, user) {
  await ensureSchema();
  const body = await readJson(req);
  const v = validateItemInput(body);
  if (v.error) return sendErr(res, 400, v.error);
  const imageUrl = validImage(body.imageUrl);
  const result = await db().execute({
    sql: `INSERT INTO wishlist_items (name, link, price, added_by, want_level, image_url)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [v.name, v.link, v.price, user, v.wantLevel, imageUrl],
  });
  sendJson(res, 201, { id: Number(result.rows[0].id) });
}

async function apiGet(_req, res, viewer, id) {
  await ensureSchema();
  const result = await db().execute({
    sql: 'SELECT * FROM wishlist_items WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return sendErr(res, 404, 'Not found');
  sendJson(res, 200, toItem(result.rows[0], viewer));
}

async function apiUpdate(req, res, user, id) {
  await ensureSchema();
  const body = await readJson(req);
  const v = validateItemInput(body);
  if (v.error) return sendErr(res, 400, v.error);

  if (body.clearImage) {
    await db().execute({
      sql: `UPDATE wishlist_items
            SET name=?, link=?, price=?, want_level=?, image_url=NULL
            WHERE id=? AND added_by=? AND status != 'gifted'`,
      args: [v.name, v.link, v.price, v.wantLevel, id, user],
    });
  } else {
    const imageUrl = validImage(body.imageUrl);
    if (imageUrl !== null) {
      await db().execute({
        sql: `UPDATE wishlist_items
              SET name=?, link=?, price=?, want_level=?, image_url=?
              WHERE id=? AND added_by=? AND status != 'gifted'`,
        args: [v.name, v.link, v.price, v.wantLevel, imageUrl, id, user],
      });
    } else {
      await db().execute({
        sql: `UPDATE wishlist_items
              SET name=?, link=?, price=?, want_level=?
              WHERE id=? AND added_by=? AND status != 'gifted'`,
        args: [v.name, v.link, v.price, v.wantLevel, id, user],
      });
    }
  }
  sendJson(res, 200, { ok: true });
}

async function apiDelete(_req, res, user, id) {
  await ensureSchema();
  // Tianna can't delete an item that's already been claimed (preserves the surprise).
  await db().execute({
    sql: `DELETE FROM wishlist_items
          WHERE id=? AND added_by=? AND status != 'gifted'
          AND NOT (status='claimed' AND added_by='Tianna')`,
    args: [id, user],
  });
  sendJson(res, 200, { ok: true });
}

async function apiClaim(_req, res, user, id) {
  await ensureSchema();
  if (user !== 'Isaiah') return sendErr(res, 403, 'Only Isaiah can claim');
  await db().execute({
    sql: `UPDATE wishlist_items SET status='claimed', claimed_by=?, claimed_at=datetime('now')
          WHERE id=? AND status='available'`,
    args: [user, id],
  });
  sendJson(res, 200, { ok: true });
}

async function apiUnclaim(_req, res, user, id) {
  await ensureSchema();
  await db().execute({
    sql: `UPDATE wishlist_items SET status='available', claimed_by=NULL, claimed_at=NULL
          WHERE id=? AND status='claimed' AND claimed_by=?`,
    args: [id, user],
  });
  sendJson(res, 200, { ok: true });
}

async function apiGift(_req, res, user, id) {
  await ensureSchema();
  await db().execute({
    sql: `UPDATE wishlist_items SET status='gifted', gifted_at=datetime('now')
          WHERE id=? AND status='claimed' AND claimed_by=?`,
    args: [id, user],
  });
  sendJson(res, 200, { ok: true });
}

// ---------- API: fetch-price (Open Graph scraper) ----------
function extractMeta(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i'
    );
    const m = html.match(re);
    if (m) return m[1];
    const reRev = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${name}["']`,
      'i'
    );
    const m2 = html.match(reRev);
    if (m2) return m2[1];
  }
  return null;
}

function toNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.,]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findPriceInJson(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const f = findPriceInJson(item);
      if (f !== null) return f;
    }
    return null;
  }
  if (typeof data === 'object') {
    if ('price' in data) {
      const n = toNumber(String(data.price));
      if (n !== null) return n;
    }
    if ('lowPrice' in data) {
      const n = toNumber(String(data.lowPrice));
      if (n !== null) return n;
    }
    for (const v of Object.values(data)) {
      const f = findPriceInJson(v);
      if (f !== null) return f;
    }
  }
  return null;
}

function extractTitle(html) {
  const og = extractMeta(html, ['og:title', 'twitter:title']);
  if (og) return og.trim();
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return m[1].trim().replace(/\s+/g, ' ').slice(0, 200);
  return null;
}

async function apiFetchPrice(req, res) {
  const body = await readJson(req);
  const url = (body.url || '').trim();
  if (!url) return sendErr(res, 400, 'missing url');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return sendErr(res, 400, 'bad url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return sendErr(res, 400, 'bad protocol');
  }
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return sendJson(res, 200, { price: null, title: null });
    const html = await r.text();
    let price = toNumber(
      extractMeta(html, ['product:price:amount', 'og:price:amount', 'price', 'twitter:data1'])
    );
    if (price === null) {
      const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = ldRe.exec(html)) !== null) {
        try {
          const found = findPriceInJson(JSON.parse(m[1].trim()));
          if (found !== null) {
            price = found;
            break;
          }
        } catch {}
      }
    }
    sendJson(res, 200, { price, title: extractTitle(html) });
  } catch {
    sendJson(res, 200, { price: null, title: null });
  }
}

// ---------- Router ----------
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = req.method;

  if (path.startsWith('/api/')) {
    if (method === 'POST' && path === '/api/login') return apiLogin(req, res);
    if (method === 'POST' && path === '/api/logout') return apiLogout(req, res);
    if (method === 'GET' && path === '/api/me') return apiMe(req, res);

    const user = getUser(req);
    if (!user) return sendErr(res, 401, 'Not authenticated');

    if (method === 'GET' && path === '/api/items') return apiListActive(req, res, user, url);
    if (method === 'GET' && path === '/api/items/gifted') return apiListGifted(req, res, user);
    if (method === 'POST' && path === '/api/items') return apiCreate(req, res, user);
    if (method === 'POST' && path === '/api/fetch-price') return apiFetchPrice(req, res);

    let m = path.match(/^\/api\/items\/(\d+)$/);
    if (m) {
      const id = parseId(m[1]);
      if (id === null) return sendErr(res, 400, 'Invalid id');
      if (method === 'GET') return apiGet(req, res, user, id);
      if (method === 'PUT') return apiUpdate(req, res, user, id);
      if (method === 'DELETE') return apiDelete(req, res, user, id);
      return sendErr(res, 405, 'Method not allowed');
    }
    m = path.match(/^\/api\/items\/(\d+)\/(claim|unclaim|gift)$/);
    if (m && method === 'POST') {
      const id = parseId(m[1]);
      if (id === null) return sendErr(res, 400, 'Invalid id');
      if (m[2] === 'claim') return apiClaim(req, res, user, id);
      if (m[2] === 'unclaim') return apiUnclaim(req, res, user, id);
      if (m[2] === 'gift') return apiGift(req, res, user, id);
    }
    return sendErr(res, 404, 'Not found');
  }

  if (method === 'GET' || method === 'HEAD') return serveStatic(res, path);
  send(res, 405, 'Method not allowed', 'text/plain');
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    console.error('[server]', err);
    const status = Number.isInteger(err?.code) ? err.code : 500;
    if (!res.headersSent) sendErr(res, status, err?.message || 'Server error');
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Wishlist listening on http://localhost:${PORT}`);
});
