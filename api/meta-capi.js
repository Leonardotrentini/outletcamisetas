const PIXEL_ID = process.env.META_PIXEL_ID || '997299299778029';
const GRAPH_VERSION = 'v21.0';

function getAccessToken() {
  return process.env.META_CAPI_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
}

function clientIp(req) {
  var xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || undefined;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(function (resolve) {
    var raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
    });
    req.on('end', function () {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  var token = getAccessToken();
  if (!token) {
    return res.status(500).json({ ok: false, error: 'missing_meta_capi_token' });
  }

  var body = await readBody(req);
  var eventName = String(body.eventName || body.event_name || 'Contact');
  var eventId = String(body.eventId || body.event_id || '');
  var eventSourceUrl = String(body.eventSourceUrl || body.event_source_url || body.pageUrl || '');
  var fbp = body.fbp || null;
  var fbc = body.fbc || null;
  var fbclid = body.fbclid || null;
  var userAgent = body.userAgent || req.headers['user-agent'] || undefined;

  if (!fbc && fbclid) {
    fbc = 'fb.1.' + Date.now() + '.' + fbclid;
  }

  var userData = {};
  if (clientIp(req)) userData.client_ip_address = clientIp(req);
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = String(fbp);
  if (fbc) userData.fbc = String(fbc);

  var eventTime = Math.floor(Date.now() / 1000);
  var payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId || undefined,
        event_source_url: eventSourceUrl || undefined,
        action_source: 'website',
        user_data: userData,
      },
    ],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    var url =
      'https://graph.facebook.com/' +
      GRAPH_VERSION +
      '/' +
      encodeURIComponent(PIXEL_ID) +
      '/events?access_token=' +
      encodeURIComponent(token);

    var metaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var metaJson = await metaRes.json().catch(function () {
      return {};
    });

    if (!metaRes.ok) {
      return res.status(502).json({
        ok: false,
        error: 'meta_capi_rejected',
        detail: metaJson.error || metaJson,
      });
    }

    return res.status(200).json({
      ok: true,
      eventName: eventName,
      eventId: eventId || null,
      events_received: metaJson.events_received,
      fbtrace_id: metaJson.fbtrace_id,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'meta_capi_failed',
      detail: String(err && err.message ? err.message : err),
    });
  }
};
