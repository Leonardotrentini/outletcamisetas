const { Redis } = require('@upstash/redis');
const sellersConfig = require('../sellers.json');

// Contador GLOBAL compartilhado pelas 2 LPs (site + Instagram)
// Clique 1 → vinicius | Clique 2 → juliana | Clique 3 → vinicius …
const REDIS_KEY = 'outlet-paginas:sellers:seq';

const MESSAGES = {
  // x1-direto
  site: 'Olá, vim pelo site e quero comprar em atacado!',
  // Linkbio / Instagram
  instagram: 'Olá, vim pelo Instagram e quero comprar no atacado!',
};

function getSellers() {
  const fromEnv = (process.env.OUTLET_SELLERS || '')
    .split(/[\n,]+/)
    .map(function (line) {
      return String(line || '').trim();
    })
    .filter(Boolean)
    .map(function (entry, i) {
      // Formatos: "5511..." ou "Nome|5511..."
      var parts = entry.split('|').map(function (p) {
        return p.trim();
      });
      if (parts.length >= 2) {
        return { label: parts[0] || 'Vendedor ' + (i + 1), phone: parts[1].replace(/\D/g, '') };
      }
      return { label: 'Vendedor ' + (i + 1), phone: parts[0].replace(/\D/g, '') };
    })
    .filter(function (s) {
      return s.phone && s.phone.length >= 10;
    });

  if (fromEnv.length) return fromEnv;

  var fromFile =
    sellersConfig && Array.isArray(sellersConfig.sellers) ? sellersConfig.sellers : [];
  return fromFile
    .map(function (s, i) {
      return {
        label: (s && s.label) || 'Vendedor ' + (i + 1),
        phone: String((s && s.phone) || '').replace(/\D/g, ''),
      };
    })
    .filter(function (s) {
      return s.phone && s.phone.length >= 10;
    });
}

function resolveVariant(req) {
  var raw = '';
  if (req.query && req.query.variant) raw = String(req.query.variant);
  raw = raw.toLowerCase().trim();
  if (raw === 'instagram' || raw === 'ig' || raw === 'linkbio') return 'instagram';
  return 'site';
}

function getRedis() {
  var url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  var token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('missing_upstash_redis_env');
  return new Redis({ url: url, token: token });
}

async function incrementGlobalSeq() {
  var redis = getRedis();
  var seq = await redis.incr(REDIS_KEY);
  var n = Number(seq);
  if (!Number.isFinite(n) || n < 1) throw new Error('redis_incr_invalid');
  return n;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  var sellers = getSellers();
  var variant = resolveVariant(req);
  var message = MESSAGES[variant] || MESSAGES.site;

  if (!sellers.length) {
    return res.status(500).json({ ok: false, error: 'no_sellers_configured' });
  }

  try {
    var total = sellers.length;
    var seq = await incrementGlobalSeq();
    var index = (seq - 1) % total;
    var seller = sellers[index];

    return res.status(200).json({
      ok: true,
      phone: seller.phone,
      label: seller.label,
      index: index,
      total: total,
      seq: seq,
      variant: variant,
      message: message,
      source: 'redis',
    });
  } catch (err) {
    // Fallback: não quebra o CTA se Redis falhar — sempre devolve o 1º número
    var fallback = sellers[0];
    return res.status(200).json({
      ok: true,
      phone: fallback.phone,
      label: fallback.label,
      index: 0,
      total: sellers.length,
      seq: null,
      variant: variant,
      message: message,
      source: 'fallback',
      warning: String(err && err.message ? err.message : err),
    });
  }
};
