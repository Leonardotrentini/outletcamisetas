(function () {
  var VESTO_KEY = 'vpk_4864beb3f157eff0a75ad050125b68dd';
  var ATTRIBUTION_URL =
    'https://backend-production-7a466.up.railway.app/api/public/meta/attribution?key=' +
    encodeURIComponent(VESTO_KEY);
  var NEXT_SELLER_URL = '/api/next-seller';
  var FALLBACK_PHONE = '5511910532881';
  var busy = false;

  var VARIANT_MESSAGES = {
    site: 'Olá, vim pelo site e quero comprar em atacado!',
    instagram: 'Olá, vim pelo Instagram e quero comprar no atacado!',
  };

  function getVariant() {
    var raw = (document.body && document.body.getAttribute('data-outlet-variant')) || 'site';
    raw = String(raw).toLowerCase().trim();
    if (raw === 'instagram' || raw === 'ig' || raw === 'linkbio') return 'instagram';
    return 'site';
  }

  function fallbackMessage() {
    return VARIANT_MESSAGES[getVariant()] || VARIANT_MESSAGES.site;
  }

  function buildRef() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var suffix = '';
    for (var i = 0; i < 8; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'vst_' + suffix;
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

  function readStoredMeta() {
    try {
      return JSON.parse(sessionStorage.getItem('vesto_meta') || '{}');
    } catch (_) {
      return {};
    }
  }

  /** Releitura no clique: URL + cookies (In-App Browser costuma gravar _fbp depois do load). */
  function captureMetaAtClick() {
    var stored = readStoredMeta();
    var params = new URLSearchParams(location.search || '');
    var fbclid = params.get('fbclid') || stored.fbclid || null;
    var fbp = getCookie('_fbp') || stored.fbp || null;
    var fbc = getCookie('_fbc') || stored.fbc || null;
    if (!fbclid) fbclid = fbclidFromFbc(fbc);
    if (fbclid && (!fbc || fbclidFromFbc(fbc) !== fbclid)) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      try {
        document.cookie =
          '_fbc=' + encodeURIComponent(fbc) + '; path=/; max-age=7776000; SameSite=Lax';
      } catch (_) {}
    }
    var meta = {
      fbclid: fbclid || null,
      fbc: fbc || null,
      fbp: fbp || null,
      clickAt: Date.now(),
      pageUrl: location.href,
      userAgent: navigator.userAgent || '',
      utm_source: params.get('utm_source') || stored.utm_source || '',
      utm_medium: params.get('utm_medium') || stored.utm_medium || '',
      utm_campaign: params.get('utm_campaign') || stored.utm_campaign || '',
      utm_content: params.get('utm_content') || stored.utm_content || '',
      utm_term: params.get('utm_term') || stored.utm_term || '',
    };
    try {
      sessionStorage.setItem('vesto_meta', JSON.stringify(meta));
    } catch (_) {}
    return meta;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sendAttribution(meta, ref, contactEventId) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : null;
    return fetch(ATTRIBUTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vesto-Key': VESTO_KEY },
      body: JSON.stringify({
        vestoPublicKey: VESTO_KEY,
        ref: ref,
        contactEventId: contactEventId,
        fbclid: meta.fbclid || null,
        fbc: meta.fbc || null,
        fbp: meta.fbp || null,
        clickAt: meta.clickAt,
        pageUrl: meta.pageUrl,
        userAgent: meta.userAgent,
        utm_source: meta.utm_source || '',
        utm_medium: meta.utm_medium || '',
        utm_campaign: meta.utm_campaign || '',
        utm_content: meta.utm_content || '',
        utm_term: meta.utm_term || '',
      }),
      credentials: 'omit',
      keepalive: true,
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('vesto_attribution_' + res.status);
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
    var url = NEXT_SELLER_URL + '?variant=' + encodeURIComponent(getVariant());
    return fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit' }).then(
      function (res) {
        if (!res.ok) throw new Error('next_seller_' + res.status);
        return res.json();
      }
    );
  }

  function openWhatsApp(phone, message) {
    var digits = String(phone || FALLBACK_PHONE).replace(/\D/g, '');
    var url =
      'https://wa.me/' + digits + '?text=' + encodeURIComponent(message || fallbackMessage());
    // Mobile/In-App: location.assign após async; window.open costuma ser bloqueado
    window.location.assign(url);
  }

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-vesto-whatsapp]');
      if (!btn || busy) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      busy = true;

      var meta = captureMetaAtClick();
      var ref = buildRef();
      var contactEventId = 'vst_contact_' + ref.toLowerCase();
      try {
        sessionStorage.setItem('vesto_ref', ref);
      } catch (_) {}
      try {
        sessionStorage.setItem('vesto_contact_event_id', contactEventId);
      } catch (_) {}

      // Só Contact no browser — Lead/Purchase ficam no CRM Vesto via CAPI
      if (typeof fbq === 'function') {
        fbq('track', 'Contact', {}, { eventID: contactEventId });
      }

      var attributionWait = Promise.race([
        sendAttribution(meta, ref, contactEventId),
        wait(2500),
      ]);

      Promise.all([nextSeller(), attributionWait])
        .then(function (results) {
          var seller = results[0] || {};
          var phone = seller.phone ? String(seller.phone) : FALLBACK_PHONE;
          openWhatsApp(phone, seller.message || fallbackMessage());
        })
        .catch(function (err) {
          console.error('[Vesto] Não foi possível obter o próximo vendedor.', err);
          openWhatsApp(FALLBACK_PHONE, fallbackMessage());
        })
        .finally(function () {
          busy = false;
        });
    },
    true
  );
})();
