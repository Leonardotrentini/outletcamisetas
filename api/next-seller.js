const { Redis } = require('@upstash/redis');
const sellersConfig = require('../sellers.json');

const MESSAGES = {
  site: 'Olá, vim pelo site e quero comprar em atacado!',
  instagram: 'Olá, vim pelo Instagram e quero comprar no atacado!',
};

function resolveVariant(req) {
  var raw = '';
  if (req.query && req.query.variant) raw = String(req.query.variant);
  raw = raw.toLowerCase().trim();
  if (raw === 'instagram' || raw === 'ig' || raw === 'linkbio') return 'instagram';
  return 'site';
}

function normalizeSellers(list) {
  if (!Array.isArray(list)) return [];
  return list
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

function getSellers(variant) {
  // Env opcional: OUTLET_SELLERS_SITE / OUTLET_SELLERS_INSTAGRAM
  var envKey = variant === 'instagram' ? 'OUTLET_SELLERS_INSTAGRAM' : 'OUTLET_SELLERS_SITE';
  var fromEnv = (process.env[envKey] || '')
    .split(/[\n,]+/)
    .map(function (line) {
      return String(line || '').trim();
    })
    .filter(Boolean)
    .map(function (entry, i) {
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

  // Novo formato: { site: [...], instagram: [...] }
  if (sellersConfig && Array.isArray(sellersConfig[variant])) {
    return normalizeSellers(sellersConfig[variant]);
  }

  // Compat: { sellers: [...] }
  if (sellersConfig && Array.isArray(sellersConfig.sellers)) {
    var all = normalizeSellers(sellersConfig.sellers);
    if (variant === 'instagram') {
      return all.filter(function (s) {
        return s.label === 'juliana' || s.phone === '5511915887485';
      });
    }
    return all;
  }

  return [];
}

function redisKeyFor(variant) {
  return 'outlet-paginas:sellers:' + variant + ':seq';
}

function getRedis() {
  var url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  var token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('missing_upstash_redis_env');
  return new Redis({ url: url, token: token });
}

async function incrementSeq(variant) {
  var redis = getRedis();
  var seq = await redis.incr(redisKeyFor(variant));
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

  var variant = resolveVariant(req);
  var sellers = getSellers(variant);
  var message = MESSAGES[variant] || MESSAGES.site;

  if (!sellers.length) {
    return res.status(500).json({ ok: false, error: 'no_sellers_configured', variant: variant });
  }

  try {
    var total = sellers.length;
    var seq = await incrementSeq(variant);
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
