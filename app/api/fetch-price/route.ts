import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../lib/session';

export const runtime = 'nodejs';

type FetchResult = { price: number | null; title: string | null };

function extractMeta(html: string, names: string[]): string | null {
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

function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractFromJsonLd(html: string): number | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const found = findPriceInJson(data);
      if (found !== null) return found;
    } catch {
      // ignore
    }
  }
  return null;
}

function findPriceInJson(data: unknown): number | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findPriceInJson(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if ('price' in obj) {
      const n = toNumber(String(obj.price));
      if (n !== null) return n;
    }
    if ('lowPrice' in obj) {
      const n = toNumber(String(obj.lowPrice));
      if (n !== null) return n;
    }
    for (const v of Object.values(obj)) {
      const found = findPriceInJson(v);
      if (found !== null) return found;
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const og = extractMeta(html, ['og:title', 'twitter:title']);
  if (og) return og.trim();
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return m[1].trim().replace(/\s+/g, ' ').slice(0, 200);
  return null;
}

async function fetchPrice(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { price: null, title: null };

  const html = await res.text();

  let price: number | null = null;

  const metaRaw = extractMeta(html, [
    'product:price:amount',
    'og:price:amount',
    'price',
    'twitter:data1',
  ]);
  price = toNumber(metaRaw);
  if (price === null) price = extractFromJsonLd(html);

  const title = extractTitle(html);
  return { price, title };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 });
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return NextResponse.json({ error: 'bad protocol' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }

  try {
    const result = await fetchPrice(url);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ price: null, title: null });
  }
}
