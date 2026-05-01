// Shared client utilities — used by every page.

export async function api(path, opts = {}) {
  const init = { ...opts };
  if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
  init.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(path, init);
  if (res.status === 401 && path !== '/api/login' && path !== '/api/me') {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
  }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function requireUser() {
  try {
    const { user } = await api('/api/me');
    return user;
  } catch {
    window.location.href = '/login';
    throw new Error('not logged in');
  }
}

export const WANT_LEVELS = [
  { value: 1, label: 'Meh', emoji: '😐' },
  { value: 2, label: 'Would be nice', emoji: '🙂' },
  { value: 3, label: 'Want it', emoji: '😍' },
  { value: 4, label: 'Really want it', emoji: '🤩' },
  { value: 5, label: 'NEED this', emoji: '🚨' },
];

export const WANT_STYLE = {
  1: { bg: '#f0e7f5', color: '#7a5b8e' },
  2: { bg: '#e6f0ff', color: '#3d6bb3' },
  3: { bg: '#fff0db', color: '#b8721e' },
  4: { bg: '#ffe1ec', color: '#c93770' },
  5: { bg: '#ffd6d6', color: '#c43030' },
};

export function wantLevel(level) {
  return WANT_LEVELS.find((l) => l.value === level) ?? WANT_LEVELS[2];
}

export function fmtPrice(p) {
  if (p == null) return '—';
  return Number(p).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function hostname(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'on' && typeof v === 'object') {
      for (const [evt, fn] of Object.entries(v)) e.addEventListener(evt, fn);
    } else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      e.appendChild(document.createTextNode(String(c)));
    } else {
      e.appendChild(c);
    }
  }
  return e;
}

export function mountHeader(user, active) {
  const navLink = (href, label, key) =>
    el('a', {
      href,
      class: 'cute-btn-ghost' + (active === key ? ' active' : ''),
    }, label);

  const logoutBtn = el(
    'button',
    {
      type: 'button',
      class: 'cute-btn-ghost',
      style: { fontSize: '12px' },
      on: {
        click: async () => {
          try { await api('/api/logout', { method: 'POST' }); } catch {}
          window.location.href = '/login';
        },
      },
    },
    'bye 👋'
  );

  const header = el(
    'header',
    { class: 'site-header' },
    el(
      'div',
      { class: 'inner' },
      el('a', { href: '/', class: 'brand' }, '🎀 ', "Tianna's Wishlist"),
      el(
        'nav',
        {},
        navLink('/', 'wishlist', 'home'),
        navLink('/add', '+ add', 'add'),
        navLink('/past-gifts', 'past gifts 🎁', 'past')
      ),
      el(
        'div',
        { class: 'user-tag' },
        el('span', {}, 'hi, '),
        el('strong', { style: { color: 'var(--ink)' } }, user || ''),
        ' ',
        user === 'Tianna' ? '🍌' : '💌',
        logoutBtn
      )
    )
  );

  document.body.insertBefore(header, document.body.firstChild);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function showError(node, msg) {
  node.textContent = msg;
  node.style.display = 'block';
}
export function clearError(node) {
  node.textContent = '';
  node.style.display = 'none';
}
