/* CubaLog — tasas.js: API informal (elToque + páginas configurables).
   - getTasas(): tasa USD/EUR/MLC del mercado informal. Cascada:
     JSON elToque -> web elToque (vía superFetch sin CORS) -> caché -> manual.
   - getFuelInformal(): precio informal CUP/L por combustible. Cascada:
     páginas fuente configuradas -> informal manual -> null (usa oficial).
   Todo con timeout corto para no frenar el cálculo. Expone: window.Tasas. */

(function () {
  var K_TASAS = "cubalog_tasas_v1";
  var K_TASA_MANUAL = "cubalog_tasa_manual";
  var K_FUELINF = "cubalog_fuel_inf_v1";
  var K_FUELINF_MAN = "cubalog_fuel_inf_manual";
  var K_FUELINF_URLS = "cubalog_fuel_inf_urls";
  var K_INF_ON = "cubalog_inf_on";

  var TRMI_JSON = [
    "https://api.eltoque.com/v1/trmi",
    "https://tasa.eltoque.com/v1/trmi"
  ];
  var TRMI_HTML = [
    "https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy",
    "https://eltoque.com/tasas-de-cambio-cuba"
  ];
  var FUEL_URLS_DEFAULT = [];

  function load(k, fb) { try { return window.Store.load(k, fb); } catch (e) { return fb; } }
  function save(k, v) { try { window.Store.save(k, v); } catch (e) {} }
  function R() { try { if (typeof root !== "undefined" && root.superFetch) return root; } catch (e) {} if (window.root && window.root.superFetch) return window.root; return null; }

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms || 9000); })]);
  }
  async function getText(url) {
    var r = R();
    if (r) return withTimeout(r.superFetch(url).then(function (x) { return x.text(); }), 10000);
    return withTimeout(fetch(url).then(function (x) { if (!x.ok) throw new Error("http " + x.status); return x.text(); }), 10000);
  }
  function num(s) { if (s == null) return NaN; var n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; }

  /* ---------- parsing ---------- */
  function parseTasasJson(t) {
    var o = null; try { o = typeof t === "string" ? JSON.parse(t) : t; } catch (e) { return null; }
    var out = {};
    function pick(obj, names) {
      if (!obj || typeof obj !== "object") return NaN;
      for (var k in obj) {
        var kl = k.toLowerCase();
        for (var i = 0; i < names.length; i++) if (kl === names[i] || kl.indexOf(names[i]) !== -1) { var n = num(obj[k]); if (isFinite(n) && n > 0) return n; }
      }
      return NaN;
    }
    if (o && o.data && Array.isArray(o.data)) {
      o.data.forEach(function (d) {
        var cur = String(d.currency || d.moneda || d.code || "").toUpperCase();
        var v = num(d.tasa || d.value || d.rate || d.precio);
        if (cur && isFinite(v)) out[cur] = v;
      });
    }
    var cont = (o && o.tasas) || o;
    var usd = pick(cont, ["usd", "dolar", "dólar", "dollar"]);
    var eur = pick(cont, ["eur", "euro"]);
    var mlc = pick(cont, ["mlc"]);
    if (isFinite(usd)) out.USD = usd; if (isFinite(eur)) out.EUR = eur; if (isFinite(mlc)) out.MLC = mlc;
    return (isFinite(out.USD) ? out : null);
  }

  // JSON-LD (elToque incrusta la tasa real aquí: {"name":"USD/CUP",...,"value":915})
  function parseJsonLdTasas(html) {
    var out = null;
    var re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    function walk(o) {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) walk(o[i]); return; }
      var name = String(o.name || ""), v = num(o.value);
      var mm = name.match(/^([A-Z]{3,4})\/CUP$/);
      if (mm && isFinite(v) && v > 0) { out = out || {}; out[mm[1]] = v; }
      for (var k in o) walk(o[k]);
    }
    while ((m = re.exec(html))) {
      try { walk(JSON.parse(m[1])); } catch (e) {}
    }
    return (out && isFinite(out.USD)) ? out : null;
  }

  function findNear(html, aliasRe, min, max) {
    var vals = [];
    var re = new RegExp(aliasRe + "[^0-9<>]{1,120}?(\\d{2,4}(?:[.,]\\d{1,2})?)", "gi");
    var m;
    while ((m = re.exec(html)) && vals.length < 8) {
      var v = num(m[1]);
      if (isFinite(v) && v >= min && v <= max) vals.push(v);
    }
    return vals;
  }
  function moda(vals) {
    if (!vals.length) return NaN;
    vals.sort(function (a, b) { return a - b; });
    return vals[Math.floor(vals.length / 2)];
  }
  function parseTasasHtml(html) {
    var h = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    var usd = moda(findNear(h, "(USD|d[óo]lar(?:es)?(?:\\s+americano)?|\\$\\s*USD)", 50, 1500));
    var eur = moda(findNear(h, "(EUR|euro(?:s)?)", 50, 1500));
    var mlc = moda(findNear(h, "(MLC)", 50, 1500));
    if (isFinite(usd)) return { USD: usd, EUR: eur, MLC: mlc };
    return null;
  }

  function parseFuelHtml(html) {
    var h = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    var out = {};
    var pats = [
      ["Gasolina Especial", "(gasolina\\s+especial|gasolina\\s+super|especial\\s+93|super\\s+93|93\\s*octanos?)"],
      ["Gasolina Regular", "(gasolina\\s+regular|regular\\s+83|83\\s*octanos?|gasolina(?!\\s+(especial|super)))"],
      ["Diesel", "(diesel|di[ée]sel|petr[óo]leo\\s+diesel)"],
      ["Diesel Especial", "(diesel\\s+especial|di[ée]sel\\s+especial)"],
      ["Gas Licuado", "(gas\\s+licuado|glp|gas\\s+licuado\\s+de\\s+petr[óo]leo)"]
    ];
    pats.forEach(function (p) {
      var vals = [];
      var re = new RegExp(p[1] + "[^0-9<>]{1,150}?(\\d{2,4}(?:[.,]\\d{1,2})?)\\s*(cup|mn|\\$|pesos)?", "gi");
      var m;
      while ((m = re.exec(h)) && vals.length < 6) {
        var v = num(m[1]);
        if (isFinite(v) && v >= 20 && v <= 1200) vals.push(v);
      }
      if (vals.length) out[p[0]] = moda(vals);
    });
    return out;
  }

  /* ---------- API pública ---------- */
  async function getTasas(opts) {
    opts = opts || {};
    var cached = load(K_TASAS, null);
    var manual = Number(load(K_TASA_MANUAL, 0)) || 0;
    async function ok() {
      // 1) JSON TRMI
      for (var i = 0; i < TRMI_JSON.length; i++) {
        try { var t = await getText(TRMI_JSON[i]); var p = parseTasasJson(t); if (p) return finish(p, "elToque TRMI (auto)"); } catch (e) {}
      }
      // 2) web elToque (JSON-LD primero: ahí está la tasa real; regex como respaldo)
      for (var j = 0; j < TRMI_HTML.length; j++) {
        try { var h = await getText(TRMI_HTML[j]); var q = parseJsonLdTasas(h) || parseTasasHtml(h); if (q) return finish(q, "elToque web (auto)"); } catch (e) {}
      }
      return null;
    }
    function finish(p, fuente) {
      var r = { USD: p.USD, EUR: isFinite(p.EUR) ? p.EUR : (cached && cached.EUR) || 0, MLC: isFinite(p.MLC) ? p.MLC : (cached && cached.MLC) || 0, fuente: fuente, fecha: new Date().toLocaleString("es-CU"), fresca: true };
      save(K_TASAS, r); return r;
    }
    if (!opts.soloCache) {
      try { var live = await ok(); if (live) return live; } catch (e) {}
    }
    if (cached && cached.USD) { cached.fresca = false; return cached; }
    return { USD: manual || 410, EUR: 0, MLC: 0, fuente: manual ? "manual (sin conexión)" : "estimada (sin conexión)", fecha: "—", fresca: false };
  }

  function getManualUSD() { return Number(load(K_TASA_MANUAL, 0)) || 0; }
  function setManualUSD(v) { save(K_TASA_MANUAL, Number(v) || 0); }
  // Tasa sincrónica (caché o manual) para pintar "≈ USD" en todo precio CUP visible
  function cachedUSD() {
    var c = load(K_TASAS, null);
    return Number((c && c.USD) || load(K_TASA_MANUAL, 0) || 0) || 0;
  }

  async function getFuelInformal(opts) {
    opts = opts || {};
    var urls = load(K_FUELINF_URLS, FUEL_URLS_DEFAULT) || [];
    var manual = load(K_FUELINF_MAN, {}) || {};
    var cached = load(K_FUELINF, null);
    var found = {}, fuentes = [];
    for (var i = 0; i < urls.length; i++) {
      var u = (urls[i] || "").trim(); if (!u) continue;
      try {
        var h = await getText(u);
        var p = parseFuelHtml(h);
        var ks = Object.keys(p);
        if (ks.length) { for (var k = 0; k < ks.length; k++) found[ks[k]] = p[ks[k]]; fuentes.push(u); }
      } catch (e) {}
      if (Object.keys(found).length >= 3) break;
    }
    // El manual informal completa lo que el scraping no encontró
    Object.keys(manual || {}).forEach(function (k) { if (!found[k] && Number(manual[k]) > 0) found[k] = Number(manual[k]); });
    var res = { precios: found, fuentes: fuentes, fecha: new Date().toLocaleString("es-CU"), fresca: fuentes.length > 0 };
    if (Object.keys(found).length) save(K_FUELINF, res);
    else if (cached && cached.precios) return cached;
    return res;
  }

  function getInfSettings() {
    return {
      on: load(K_INF_ON, true) !== false,
      manual: load(K_FUELINF_MAN, {}) || {},
      urls: load(K_FUELINF_URLS, FUEL_URLS_DEFAULT) || [],
      cache: load(K_FUELINF, null)
    };
  }
  function setInfSettings(s) {
    if (s.on !== undefined) save(K_INF_ON, !!s.on);
    if (s.manual) save(K_FUELINF_MAN, s.manual);
    if (s.urls) save(K_FUELINF_URLS, s.urls);
  }

  window.Tasas = { getTasas, getManualUSD, setManualUSD, cachedUSD, getFuelInformal, getInfSettings, setInfSettings, TRMI_HTML: TRMI_HTML };
})();
