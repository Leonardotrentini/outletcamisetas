const BASE = 'https://outlet-paginas.vercel.app';
const KEY = 'vpk_4864beb3f157eff0a75ad050125b68dd';
const BACKEND = 'https://backend-production-7a466.up.railway.app';
const JULIANA = '5511910532881';
const VINICIUS = '5511947656139';

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail || '') });
  console.log(`${pass ? '[OK]  ' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function getText(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text, headers: res.headers };
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  // 1) Paths
  for (const p of ['/', '/instagram', '/insta']) {
    const r = await getText(BASE + p);
    if (p === '/insta') ok(`HTTP ${p}`, r.status === 404, `status=${r.status}`);
    else ok(`HTTP ${p}`, r.status === 200, `status=${r.status}`);
  }

  // 2) HTML contracts
  for (const [name, path] of [
    ['site', '/'],
    ['ig', '/instagram'],
  ]) {
    const { text: h } = await getText(BASE + path);
    ok(`${name} pixel`, h.includes("fbq('init', '997299299778029')"));
    ok(`${name} pageview`, h.includes("fbq('track', 'PageView')"));
    ok(`${name} no Lead`, !h.includes("fbq('track', 'Lead'"));
    ok(`${name} vesto key`, h.includes(`vesto-attribution.js?key=${KEY}`));
    ok(`${name} data-selector`, h.includes('data-selector="[data-vesto-skip]"'));
    ok(`${name} rotator`, h.includes('vesto-global-rotator.js'));
    ok(`${name} CTA`, h.includes('data-vesto-whatsapp'));
    ok(`${name} href #`, /data-vesto-whatsapp[\s\S]{0,120}href="#"|href="#"[\s\S]{0,120}data-vesto-whatsapp/.test(h));
    ok(`${name} no hardcoded wa.me`, !/wa\.me\/55/.test(h));
    ok(`${name} no old number`, !h.includes('5511949808009'));
  }

  // 3) Live rotator JS
  const js = (await getText(BASE + '/src/js/vesto-global-rotator.js')).text;
  ok('JS key', js.includes(KEY));
  ok('JS attribution URL', js.includes('/api/public/meta/attribution'));
  ok('JS Contact', js.includes("fbq('track', 'Contact'"));
  ok('JS no Lead', !js.includes("fbq('track', 'Lead'"));
  ok('JS fallback juliana', js.includes(`FALLBACK_PHONE = '${JULIANA}'`));
  ok('JS site msg', js.includes('vim pelo site e quero comprar em atacado'));
  ok('JS ig msg', js.includes('vim pelo Instagram e quero comprar no atacado'));
  ok('JS data-vesto-whatsapp', js.includes('data-vesto-whatsapp'));

  // 4) Sequential API site
  const site = [];
  for (let i = 0; i < 6; i++) {
    site.push((await getJson(`${BASE}/api/next-seller?variant=site`)).json);
  }
  const sitePhones = site.map((s) => s.phone);
  const siteAlt = sitePhones.every((p, i) => i === 0 || p !== sitePhones[i - 1]);
  ok('SITE total=2', site[0].total === 2, `total=${site[0].total}`);
  ok('SITE both numbers', sitePhones.includes(JULIANA) && sitePhones.includes(VINICIUS), sitePhones.join(','));
  ok(
    'SITE only official',
    sitePhones.every((p) => p === JULIANA || p === VINICIUS)
  );
  ok('SITE alternating', siteAlt, site.map((s) => s.label).join(' -> '));
  ok(
    'SITE redis',
    site.every((s) => s.source === 'redis'),
    [...new Set(site.map((s) => s.source))].join(',')
  );
  ok(
    'SITE message',
    site.every((s) => s.message === 'Olá, vim pelo site e quero comprar em atacado!'),
    site[0].message
  );

  // 5) Sequential API instagram
  const ig = [];
  for (let i = 0; i < 6; i++) {
    ig.push((await getJson(`${BASE}/api/next-seller?variant=instagram`)).json);
  }
  const igPhones = ig.map((s) => s.phone);
  const igAlt = igPhones.every((p, i) => i === 0 || p !== igPhones[i - 1]);
  ok('IG total=2', ig[0].total === 2);
  ok('IG both numbers', igPhones.includes(JULIANA) && igPhones.includes(VINICIUS), igPhones.join(','));
  ok('IG alternating', igAlt, ig.map((s) => s.label).join(' -> '));
  ok(
    'IG message',
    ig.every((s) => s.message === 'Olá, vim pelo Instagram e quero comprar no atacado!'),
    ig[0].message
  );
  ok(
    'IG redis',
    ig.every((s) => s.source === 'redis')
  );
  ok('Shared global counter', ig[0].seq > site[site.length - 1].seq, `siteLast=${site[site.length - 1].seq} igFirst=${ig[0].seq}`);

  // 6) Index contract
  const j = site.find((s) => s.label === 'juliana');
  const v = site.find((s) => s.label === 'vinicius');
  ok('juliana phone', j && j.phone === JULIANA, j && j.phone);
  ok('vinicius phone', v && v.phone === VINICIUS, v && v.phone);
  ok('juliana index0', j && j.index === 0, j && `index=${j.index}`);
  ok('vinicius index1', v && v.index === 1, v && `index=${v.index}`);

  // 7) Vesto config
  const cfg = await getJson(`${BACKEND}/api/public/meta/config?key=${KEY}`, {
    headers: { Origin: 'https://outlet-paginas.vercel.app' },
  });
  const cfgPhones = (cfg.json?.sellers || []).map((s) => s.phone);
  ok('Vesto config HTTP', cfg.ok, `status=${cfg.status}`);
  ok('Vesto pixel', cfg.json?.pixelId === '997299299778029', cfg.json?.pixelId);
  ok('Vesto sequential', cfg.json?.rotatorMode === 'sequential', cfg.json?.rotatorMode);
  ok('Vesto has juliana', cfgPhones.includes(JULIANA), cfgPhones.join(','));
  ok('Vesto has vinicius', cfgPhones.includes(VINICIUS), cfgPhones.join(','));
  ok('Vesto 2 sellers', (cfg.json?.sellers || []).length === 2, `count=${(cfg.json?.sellers || []).length}`);

  // 8) wa.me format check (HEAD/GET)
  for (const [label, phone] of [
    ['juliana', JULIANA],
    ['vinicius', VINICIUS],
  ]) {
    const r = await fetch(`https://wa.me/${phone}?text=teste`, { redirect: 'manual' });
    ok(
      `wa.me ${label}`,
      r.status >= 200 && r.status < 400,
      `status=${r.status}`
    );
  }

  // summary
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`\n==== RESUMO: ${pass} OK / ${fail} FAIL / ${results.length} total ====`);
  if (fail) {
    console.log('\nFalhas:');
    for (const r of results.filter((x) => !x.pass)) console.log(`- ${r.name}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
