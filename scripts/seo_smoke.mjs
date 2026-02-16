import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.SEO_SMOKE_PORT || process.env.PORT || 3999);
const env = { ...process.env, PORT: String(port), NODE_ENV: process.env.NODE_ENV || 'production' };

const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let started = false;
const logs = [];

const onData = (d) => {
  const s = d.toString();
  logs.push(s);
  if (!started && s.includes('Server running')) started = true;
};

child.stdout.on('data', onData);
child.stderr.on('data', onData);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchText = async (url) => {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  return { res, text };
};

const extract = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : '';
};

const getFirstProjectSlug = () => {
  const dbPath = path.resolve('server/data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  return (db?.content?.projects || []).find((p) => p?.slug)?.slug || '';
};

const main = async () => {
  for (let i = 0; i < 80 && !started; i += 1) {
    await wait(100);
  }

  if (!started) {
    console.error('Server failed to start');
    console.error(logs.join(''));
    process.exitCode = 1;
    child.kill();
    return;
  }

  const slug = getFirstProjectSlug();
  const base = `http://127.0.0.1:${port}`;
  const urls = [
    `${base}/`,
    `${base}/reels`,
    `${base}/site-map`,
    `${base}/services`,
    `${base}/case-studies`,
    `${base}/guides`,
    `${base}/mishwa-zalavadiya-video-editor-portfolio`,
    `${base}/mishwa-zalavadiya-portfolio`,
    `${base}/surat-video-editor-portfolio`,
    slug ? `${base}/project/${encodeURIComponent(slug)}` : null,
    `${base}/admin/login`,
    `${base}/does-not-exist`,
    `${base}/robots.txt`,
    `${base}/sitemap.xml`,
    `${base}/sitemaps/pages.xml`,
    `${base}/sitemaps/projects.xml`,
    `${base}/sitemaps/services.xml`,
    `${base}/sitemaps/case-studies.xml`,
    `${base}/sitemaps/guides.xml`,
    `${base}/llms.txt`,
    `${base}/favicons/favicon-32x32.png`,
    `${base}/favicons/favicon-48x48.png`,
    `${base}/favicons/favicon-96x96.png`,
    `${base}/favicon.ico`
  ].filter(Boolean);

  for (const url of urls) {
    const { res, text } = await fetchText(url);
    const ct = res.headers.get('content-type') || '';

    console.log(`\n=== ${url} ===`);
    console.log('status', res.status, 'content-type', ct.split(';')[0]);

    if (ct.includes('text/html')) {
      const title = extract(text, /<title>([^<]*)<\/title>/i);
      const canonical = extract(text, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
      const desc = extract(text, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
      const robots = extract(text, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i);
      const hasJsonLd = /<script[^>]+application\/ld\+json/i.test(text);

      console.log('title:', title);
      console.log('canonical:', canonical);
      console.log('robots:', robots, 'x-robots-tag:', res.headers.get('x-robots-tag') || '');
      console.log('desc:', desc.slice(0, 140));
      console.log('jsonld:', hasJsonLd);
    } else if (ct.startsWith('image/')) {
      console.log(`[binary] ${ct} bytes=${Buffer.byteLength(text)}`);
    } else {
      console.log(text.split('\n').slice(0, 12).join('\n'));
    }
  }

  child.kill();
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  child.kill();
});
