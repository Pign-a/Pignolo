// Fetch of the development URL for the static SEO checks (spec §5.4, A-06). Local only: the
// plugin never reaches anything remote at run time (spec §0), so every URL must be loopback.
//
// isLoopbackUrl(u) -> boolean      http(s) on localhost, 127.0.0.0/8 or [::1], without resolving
//   names (a *.localhost name is refused: nothing guarantees how the system resolves it)
// fetchSite({ urls, timeoutMs = 5000, deadlineMs = 60000, maxBytes = 2 MiB, fetchImpl = fetch })
//   -> { origin, pages: [resource], robots: resource, sitemaps: [resource & { declared }] } or null without urls
//   page/resource = { url, path, finalUrl, status, headers: { 'content-type', 'x-robots-tag' },
//                     text, sha256 } | { url, path, error }
// Redirects are followed by hand, up to 5 hops, and only inside the same origin; a hop to
// another origin stops with error 'redirected outside the development origin'. Never throws
// for network problems: they become `error` (the rules turn it into unverified). deadlineMs
// bounds the whole fetch (pages, robots.txt, sitemaps): what has not arrived by then gets
// error 'deadline (<n> ms for the whole --url fetch)'.
import crypto from 'node:crypto';
import { parseRobots } from './robots.mjs';

const MAX_HOPS = 5;
const MAX_SITEMAPS = 5;

export function isLoopbackUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost') return true;
  if (h === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return Boolean(m) && Number(m[1]) === 127 && m.slice(2).every((x) => Number(x) <= 255);
}

async function readCapped(res, maxBytes) {
  if (!res.body) return { buf: Buffer.alloc(0), tooLarge: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return { buf: null, tooLarge: true }; }
    chunks.push(value);
  }
  return { buf: Buffer.concat(chunks.map((c) => Buffer.from(c))), tooLarge: false };
}

async function fetchOne(url, { origin, timeoutMs, deadlineAt, deadlineMs, maxBytes, fetchImpl }) {
  const path = new URL(url).pathname;
  const late = { url, path, error: `deadline (${deadlineMs} ms for the whole --url fetch)` };
  const budget = deadlineAt - Date.now();
  if (budget <= 0) return late;
  const ms = Math.min(timeoutMs, budget);
  let current = url;
  const signal = AbortSignal.timeout(ms);
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const res = await fetchImpl(current, { redirect: 'manual', signal, headers: { accept: 'text/html,application/xml,text/plain;q=0.9,*/*;q=0.5' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), current);
        await res.body?.cancel().catch(() => {});
        if (next.origin !== origin) return { url, path, error: 'redirected outside the development origin' };
        current = next.href;
        continue;
      }
      const body = await readCapped(res, maxBytes);
      if (body.tooLarge) return { url, path, error: `response larger than ${maxBytes} bytes` };
      return {
        url,
        path,
        finalUrl: current,
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') ?? '', 'x-robots-tag': res.headers.get('x-robots-tag') ?? '' },
        text: body.buf.toString('utf8'),
        sha256: crypto.createHash('sha256').update(body.buf).digest('hex'),
      };
    }
    return { url, path, error: 'too many redirects' };
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    if (timedOut && ms < timeoutMs) return late;
    const why = timedOut ? `no response in ${timeoutMs} ms` : `request failed (${e && e.cause && e.cause.code ? e.cause.code : e && e.message})`;
    return { url, path, error: why };
  }
}

export async function fetchSite({ urls, timeoutMs = 5000, deadlineMs = 60000, maxBytes = 2 * 1024 * 1024, fetchImpl = globalThis.fetch } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  for (const u of urls) if (!isLoopbackUrl(u)) throw new Error(`not a loopback URL: ${u}`);
  const origin = new URL(urls[0]).origin;
  for (const u of urls) if (new URL(u).origin !== origin) throw new Error(`all --url must share one origin: ${u}`);
  const opts = { origin, timeoutMs, deadlineAt: Date.now() + deadlineMs, deadlineMs, maxBytes, fetchImpl };
  const pages = [];
  for (const u of urls) pages.push(await fetchOne(u, opts));
  const robots = await fetchOne(new URL('/robots.txt', origin).href, opts);
  // sitemaps referenced by robots.txt, fetched by their path on the development origin
  // (a production URL in robots.txt is never requested: nothing remote at run time)
  const sitemaps = [];
  if (!robots.error && robots.status === 200) {
    for (const s of parseRobots(robots.text).sitemaps.slice(0, MAX_SITEMAPS)) {
      let p;
      try { p = new URL(s.url, origin).pathname; } catch { continue; }
      sitemaps.push({ ...(await fetchOne(new URL(p, origin).href, opts)), declared: s.url });
    }
  }
  return { origin, pages, robots, sitemaps };
}
