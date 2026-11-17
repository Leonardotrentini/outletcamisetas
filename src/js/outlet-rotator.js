(function () {
  var NEXT_SELLER_URL = '/api/next-seller';
  var CAPI_URL = '/api/meta-capi';
  var FALLBACK_PHONE = '5511915887485';
  var busy = false;

  var VARIANT_MESSAGES = {
    site: 'Olá, vim pelo site e quero comprar em atacado!',
    instagram: 'Olá, vim pelo Instagram e quero comprar no atacado!',
  };

  function getVariant() {
    var raw = (document.body && document.body.getAttribute('data-outlet-variant')) || 'site';
    raw = String(raw).toLowerCase().trim();
    if (raw === 'instagram' || raw === 'ig') return 'instagram';
    return 'site';
  }

  function fallbackMessage() {
    return VARIANT_MESSAGES[getVariant()] || VARIANT_MESSAGES.site;
  }

  function buildRef() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var suffix = '';
    for (var i = 0; i < 8; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'out_' + suffix;
  }

  function getCookie(name) {
    try {
      var m = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
      );
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function fbclidFromFbc(fbc) {
    if (!fbc) return null;
    var parts = String(fbc).split('.');
    if (parts.length >= 4 && parts[0] === 'fb') return parts.slice(3).join('.') || null;
    return null;
  }

  function captureMetaAtClick() {
    var params = new URLSearchParams(location.search || '');
    var fbclid = params.get('fbclid') || null;
    var fbp = getCookie('_fbp') || null;
    var fbc = getCookie('_fbc') || null;
    if (!fbclid) fbclid = fbclidFromFbc(fbc);
    if (fbclid && (!fbc || fbclidFromFbc(fbc) !== fbclid)) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      try {
        document.cookie =
          '_fbc=' + encodeURIComponent(fbc) + '; path=/; max-age=7776000; SameSite=Lax';
      } catch (_) {}
    }
    return {
      fbclid: fbclid || null,
      fbc: fbc || null,
      fbp: fbp || null,
      clickAt: Date.now(),
      pageUrl: location.href,
      userAgent: navigator.userAgent || '',
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
    };
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function trackPixel(contactEventId) {
    if (typeof fbq !== 'function') return;
    try {
      fbq('track', 'Contact', {}, { eventID: contactEventId });
    } catch (_) {}
  }

  function sendCapi(meta, contactEventId) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : null;
    return fetch(CAPI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'Contact',
        eventId: contactEventId,
        eventSourceUrl: meta.pageUrl,
        pageUrl: meta.pageUrl,
        fbclid: meta.fbclid,
        fbc: meta.fbc,
        fbp: meta.fbp,
        userAgent: meta.userAgent,
      }),
      credentials: 'omit',
      keepalive: true,
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('capi_' + res.status);
        return res.json();
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function nextSeller() {
    var variant = getVariant();
    var url = NEXT_SELLER_URL + '?variant=' + encodeURIComponent(variant);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 2000) : null;
    return fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('next_seller_' + res.status);
        return res.json();
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function openWhatsApp(phone, message) {
    var digits = String(phone || FALLBACK_PHONE).replace(/\D/g, '');
    var url =
      'https://wa.me/' + digits + '?text=' + encodeURIComponent(message || fallbackMessage());
    window.location.assign(url);
  }

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-outlet-whatsapp]');
      if (!btn || busy) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      busy = true;

      var meta = captureMetaAtClick();
      var ref = buildRef();
      var contactEventId = 'out_contact_' + ref.toLowerCase();

      trackPixel(contactEventId);

      var capiWait = Promise.race([sendCapi(meta, contactEventId), wait(2500)]);

      Promise.all([nextSeller().catch(function () { return null; }), capiWait])
        .then(function (results) {
          var seller = results[0] || {};
          var phone = seller.phone ? String(seller.phone) : FALLBACK_PHONE;
          var message = seller.message || fallbackMessage();
          openWhatsApp(phone, message);
        })
        .catch(function () {
          openWhatsApp(FALLBACK_PHONE, fallbackMessage());
        })
        .finally(function () {
          busy = false;
        });
    },
    true
  );
})();
