/* CubaLog — store.js: persistencia en localStorage + utilidades de consumo.
   Expone: window.Store, window.Fuel, window.Recargos, window.toLitersPerKm */

(function () {
  const K = {
    vehicles: "cubalog_vehicles_v1",
    fuel: "cubalog_fuel_v1",
    recargos: "cubalog_recargos_v1",
    chofer: "cubalog_chofer_v1",
    gkey: "cubalog_gkey_v1",
    expenses: "cubalog_expenses_v1",
    lastRoute: "cubalog_lastroute_v1"
  };

  // Claves globales (no se aíslan por usuario)
  const GLOBAL_KEYS = new Set(["cubalog_users_v1", "cubalog_session_v1", "cubalog_theme"]);

  // Si hay sesión iniciada, los datos de la app viven en el espacio del usuario.
  function nsKey(key) {
    if (GLOBAL_KEYS.has(key)) return key;
    try {
      const au = window.Auth;
      if (au && au.currentUid) return "cubalog_u_" + au.currentUid + "_" + key;
    } catch (e) {}
    return key;
  }

  const Store = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(nsKey(key));
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    save(key, val) { try { localStorage.setItem(nsKey(key), JSON.stringify(val)); } catch (e) {} },
    // acceso explícito sin namespacing (auth, backups)
    loadRaw(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    saveRaw(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },
    removeRaw(key) { try { localStorage.removeItem(key); } catch (e) {} },
    keys: K
  };

  function defaultFuel() {
    try {
      if (typeof root !== "undefined" && root.cfgCombustible) {
        const o = {};
        for (const it of root.cfgCombustible.selectAll) o[it.evaluateItem] = Number(it.value ?? it.evaluateItem);
        // selectAll da nodos; forma robusta:
        return { "Gasolina Regular": 132, "Gasolina Especial": 156, "Diesel": 135, "Diesel Especial": 148, "Gas Licuado": 85 };
      }
    } catch (e) {}
    return { "Gasolina Regular": 132, "Gasolina Especial": 156, "Diesel": 135, "Diesel Especial": 148, "Gas Licuado": 85 };
  }

  const Fuel = {
    getAll() {
      const d = defaultFuel();
      const saved = Store.load(K.fuel, null);
      return Object.assign({}, d, saved || {});
    },
    get(tipo) { return Number(this.getAll()[tipo] ?? 132); },
    setAll(obj) { Store.save(K.fuel, obj); }
  };

  const Recargos = {
    defaults() { return { "Pasajeros": 15, "Carga": 25, "Pasajeros con Carga": 35 }; },
    getAll() { return Object.assign(this.defaults(), Store.load(K.recargos, {}) || {}); },
    setAll(o) { Store.save(K.recargos, o); }
  };

  // Convierte cualquier unidad a L/km (canónico interno)
  function toLitersPerKm(valor, unidad) {
    const v = Number(valor);
    if (!isFinite(v) || v <= 0) return 0;
    if (unidad === "L/100km") return v / 100;
    if (unidad === "km/L") return 1 / v;
    return v; // "L/km"
  }
  function fromLitersPerKm(lkm, unidad) {
    if (!lkm || lkm <= 0) return 0;
    if (unidad === "L/100km") return lkm * 100;
    if (unidad === "km/L") return 1 / lkm;
    return lkm;
  }

  function uid() { return "id" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  window.Store = Store; window.Fuel = Fuel; window.Recargos = Recargos;
  window.toLitersPerKm = toLitersPerKm; window.fromLitersPerKm = fromLitersPerKm;
  window.uid = uid; window.esc = esc;
})();
