const BASE = 'https://outlet-paginas.vercel.app';

async function run() {
  console.log('=== SITE (juliana + vinicius sequencial) ===');
  const site = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/api/next-seller?variant=site`, { cache: 'no-store' }).then((x) =>
      x.json()
    );
    site.push(r);
    console.log(
      `click ${i + 1} -> ${r.label} ${r.phone} total=${r.total} seq=${r.seq} source=${r.source}`
    );
  }

  console.log('\n=== INSTAGRAM (só juliana) ===');
  const ig = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/api/next-seller?variant=instagram`, { cache: 'no-store' }).then(
      (x) => x.json()
    );
    ig.push(r);
    console.log(
      `click ${i + 1} -> ${r.label} ${r.phone} total=${r.total} seq=${r.seq} source=${r.source}`
    );
  }

  const sitePhones = [...new Set(site.map((s) => s.phone))];
  const igPhones = [...new Set(ig.map((s) => s.phone))];
  const checks = [
    ['site total=2', site.every((s) => s.total === 2)],
    ['site has juliana', sitePhones.includes('5511915887485')],
    ['site has vini', sitePhones.includes('5511998772154')],
    ['site alternating', site.every((s, i) => i === 0 || s.phone !== site[i - 1].phone)],
    ['ig total=1', ig.every((s) => s.total === 1)],
    ['ig only juliana', igPhones.length === 1 && igPhones[0] === '5511915887485'],
    ['ig never vini', !igPhones.includes('5511998772154')],
    ['site msg', site.every((s) => s.message.includes('site'))],
    ['ig msg', ig.every((s) => s.message.includes('Instagram'))],
    ['redis', [...site, ...ig].every((s) => s.source === 'redis')],
  ];

  console.log('\n=== CHECKS ===');
  let fail = 0;
  for (const [name, pass] of checks) {
    console.log(`${pass ? '[OK]' : '[FAIL]'} ${name}`);
    if (!pass) fail++;
  }
  console.log(`\n==== ${checks.length - fail}/${checks.length} OK ====`);
  if (fail) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
