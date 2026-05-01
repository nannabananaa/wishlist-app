// Cloudflare Worker — wishlist app backend.
// Frontend (HTML/CSS/JS) is served from ./public via the ASSETS binding.

import { createClient } from '@libsql/client/web';

const COOKIE_NAME = 'wishlist_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// ---------- Database ----------
function getDb(env) {
  if (!env.TURSO_URL) throw httpError(500, 'Missing TURSO_URL');
  // Accept either var name — production uses TURSO_AUTH_TOKEN, older
  // local .dev.vars may carry over TURSO_TOKEN.
  const authToken = env.TURSO_AUTH_TOKEN || env.TURSO_TOKEN;
  if (!authToken) throw httpError(500, 'Missing TURSO_AUTH_TOKEN');
  return createClient({ url: env.TURSO_URL, authToken });
}

let _schemaPromise = null;
function ensureSchema(env) {
  if (!_schemaPromise) {
    _schemaPromise = (async () => {
      const db = getDb(env);
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
      // Older DBs created before image_url existed.
      try {
        await db.execute(`ALTER TABLE wishlist_items ADD COLUMN image_url TEXT`);
      } catch {}
    })().catch((e) => {
      _schemaPromise = null; // allow retry on next request
      throw e;
    });
  }
  return _schemaPromise;
}

// ---------- Sessions (Web Crypto HMAC-SHA256, base64url) ----------
function b64uEncode(buf) {
  let s = '';
  const arr = new Uint8Array(buf);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signingKey(env) {
  if (!env.SESSION_SECRET) throw httpError(500, 'Missing SESSION_SECRET');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function sign(value, key) {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return b64uEncode(sig);
}

async function encodeToken(user, env) {
  const payload = b64uEncode(new TextEncoder().encode(user));
  const sig = await sign(payload, await signingKey(env));
  return `${payload}.${sig}`;
}

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function decodeToken(token, env) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await sign(payload, await signingKey(env));
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const user = new TextDecoder().decode(b64uDecode(payload));
    if (user !== 'Tianna' && user !== 'Isaiah') return null;
    return user;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function getUser(req, env) {
  const token = getCookie(req, COOKIE_NAME);
  return token ? decodeToken(token, env) : null;
}

function setCookieHeader(token, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(secure) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// ---------- Response helpers ----------
function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}
const errJson = (status, msg, headers) => json({ error: msg }, { status, headers });
function httpError(status, msg) {
  const e = new Error(msg);
  e.status = status;
  return e;
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
  if (!s || typeof s !== 'string') return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 7 * 1024 * 1024) return null;
  return s;
}

function parseId(s) {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateItem(body) {
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

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw httpError(400, 'Invalid JSON');
  }
}

// ---------- API: auth ----------
async function apiLogin(req, env, secure) {
  const body = await readJson(req);
  const user = body.user;
  const password = body.password;
  // Accept either persona env var name (older local vars used Nanna/Jenel).
  const tiannaPw = env.TIANNA_PASSWORD || env.NANNA_PASSWORD;
  const isaiahPw = env.ISAIAH_PASSWORD || env.JENEL_PASSWORD;
  let ok = false;
  if (user === 'Tianna' && password && password === tiannaPw) ok = true;
  if (user === 'Isaiah' && password && password === isaiahPw) ok = true;
  if (!ok) return errJson(401, 'Invalid credentials');
  const token = await encodeToken(user, env);
  return json({ user }, { headers: { 'Set-Cookie': setCookieHeader(token, secure) } });
}

function apiLogout(secure) {
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookieHeader(secure) } });
}

async function apiMe(req, env) {
  const user = await getUser(req, env);
  if (!user) return errJson(401, 'Not authenticated');
  return json({ user });
}

// ---------- API: items ----------
async function apiListActive(env, viewer, url) {
  await ensureSchema(env);
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
  const result = await getDb(env).execute({
    sql: `SELECT * FROM wishlist_items WHERE ${where} ORDER BY ${orderBy}`,
    args,
  });
  return json(result.rows.map((r) => toItem(r, viewer)));
}

async function apiListGifted(env, viewer) {
  await ensureSchema(env);
  const result = await getDb(env).execute(
    `SELECT * FROM wishlist_items WHERE status = 'gifted' ORDER BY gifted_at DESC`
  );
  return json(result.rows.map((r) => toItem(r, viewer)));
}

async function apiCreate(req, env, user) {
  await ensureSchema(env);
  const body = await readJson(req);
  const v = validateItem(body);
  if (v.error) return errJson(400, v.error);
  const imageUrl = validImage(body.imageUrl);
  const result = await getDb(env).execute({
    sql: `INSERT INTO wishlist_items (name, link, price, added_by, want_level, image_url)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [v.name, v.link, v.price, user, v.wantLevel, imageUrl],
  });
  return json({ id: Number(result.rows[0].id) }, { status: 201 });
}

async function apiGet(env, viewer, id) {
  await ensureSchema(env);
  const result = await getDb(env).execute({
    sql: 'SELECT * FROM wishlist_items WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return errJson(404, 'Not found');
  return json(toItem(result.rows[0], viewer));
}

async function apiUpdate(req, env, user, id) {
  await ensureSchema(env);
  const body = await readJson(req);
  const v = validateItem(body);
  if (v.error) return errJson(400, v.error);
  const db = getDb(env);

  if (body.clearImage) {
    await db.execute({
      sql: `UPDATE wishlist_items
            SET name=?, link=?, price=?, want_level=?, image_url=NULL
            WHERE id=? AND added_by=? AND status != 'gifted'`,
      args: [v.name, v.link, v.price, v.wantLevel, id, user],
    });
  } else {
    const imageUrl = validImage(body.imageUrl);
    if (imageUrl !== null) {
      await db.execute({
        sql: `UPDATE wishlist_items
              SET name=?, link=?, price=?, want_level=?, image_url=?
              WHERE id=? AND added_by=? AND status != 'gifted'`,
        args: [v.name, v.link, v.price, v.wantLevel, imageUrl, id, user],
      });
    } else {
      await db.execute({
        sql: `UPDATE wishlist_items
              SET name=?, link=?, price=?, want_level=?
              WHERE id=? AND added_by=? AND status != 'gifted'`,
        args: [v.name, v.link, v.price, v.wantLevel, id, user],
      });
    }
  }
  return json({ ok: true });
}

async function apiDelete(env, user, id) {
  await ensureSchema(env);
  // Tianna can't delete her own item once Isaiah has claimed it (preserves the surprise).
  await getDb(env).execute({
    sql: `DELETE FROM wishlist_items
          WHERE id=? AND added_by=? AND status != 'gifted'
          AND NOT (status='claimed' AND added_by='Tianna')`,
    args: [id, user],
  });
  return json({ ok: true });
}

async function apiClaim(env, user, id) {
  await ensureSchema(env);
  if (user !== 'Isaiah') return errJson(403, 'Only Isaiah can claim');
  await getDb(env).execute({
    sql: `UPDATE wishlist_items
          SET status='claimed', claimed_by=?, claimed_at=datetime('now')
          WHERE id=? AND status='available'`,
    args: [user, id],
  });
  return json({ ok: true });
}

async function apiUnclaim(env, user, id) {
  await ensureSchema(env);
  await getDb(env).execute({
    sql: `UPDATE wishlist_items
          SET status='available', claimed_by=NULL, claimed_at=NULL
          WHERE id=? AND status='claimed' AND claimed_by=?`,
    args: [id, user],
  });
  return json({ ok: true });
}

async function apiGift(env, user, id) {
  await ensureSchema(env);
  await getDb(env).execute({
    sql: `UPDATE wishlist_items
          SET status='gifted', gifted_at=datetime('now')
          WHERE id=? AND status='claimed' AND claimed_by=?`,
    args: [id, user],
  });
  return json({ ok: true });
}

// ---------- API: fetch-price (Open Graph / JSON-LD scraper) ----------
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

async function apiFetchPrice(req) {
  const body = await readJson(req);
  const url = String(body.url || '').trim();
  if (!url) return errJson(400, 'missing url');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return errJson(400, 'bad url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return errJson(400, 'bad protocol');
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
    if (!r.ok) return json({ price: null, title: null });
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
          if (found !== null) { price = found; break; }
        } catch {}
      }
    }
    return json({ price, title: extractTitle(html) });
  } catch {
    return json({ price: null, title: null });
  }
}

// ---------- Router ----------
async function handleApi(req, env, url, secure) {
  const method = req.method;
  const path = url.pathname;

  if (method === 'POST' && path === '/api/login') return apiLogin(req, env, secure);
  if (method === 'POST' && path === '/api/logout') return apiLogout(secure);
  if (method === 'GET' && path === '/api/me') return apiMe(req, env);

  const user = await getUser(req, env);
  if (!user) return errJson(401, 'Not authenticated');

  if (method === 'GET' && path === '/api/items') return apiListActive(env, user, url);
  if (method === 'GET' && path === '/api/items/gifted') return apiListGifted(env, user);
  if (method === 'POST' && path === '/api/items') return apiCreate(req, env, user);
  if (method === 'POST' && path === '/api/fetch-price') return apiFetchPrice(req);

  let m = path.match(/^\/api\/items\/(\d+)$/);
  if (m) {
    const id = parseId(m[1]);
    if (id === null) return errJson(400, 'Invalid id');
    if (method === 'GET') return apiGet(env, user, id);
    if (method === 'PUT') return apiUpdate(req, env, user, id);
    if (method === 'DELETE') return apiDelete(env, user, id);
    return errJson(405, 'Method not allowed');
  }
  m = path.match(/^\/api\/items\/(\d+)\/(claim|unclaim|gift)$/);
  if (m && method === 'POST') {
    const id = parseId(m[1]);
    if (id === null) return errJson(400, 'Invalid id');
    if (m[2] === 'claim') return apiClaim(env, user, id);
    if (m[2] === 'unclaim') return apiUnclaim(env, user, id);
    if (m[2] === 'gift') return apiGift(env, user, id);
  }
  return errJson(404, 'Not found');
}

// ---------- Main entry ----------
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const secure = url.protocol === 'https:';
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env, url, secure);
      }
      // All non-API requests fall through to static assets (./public).
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('[worker]', e);
      const status = Number.isInteger(e?.status) ? e.status : 500;
      return errJson(status, e?.message || 'Server error');
    }
  },
};
