/* CubaLog — server.js: conexión con la base de datos (Apps Script ligado a
   «CubaLog DB»). Servidor primero cuando hay conexión: login, usuarios y el
   espacio de datos de cada usuario viven en el servidor; localStorage queda
   como caché de trabajo y respaldo sin conexión.
   Expone: window.Server */

(function () {
  const CL_API = "https://script.google.com/macros/s/AKfycbzklhqJFB1x_6u5_q4EdRH5Y64mJQxQry-kL8Znaz7uu3i9LNBq31PI0_nPv58L5kOA8w/exec";
  const K_TOKEN = "cubalog_token_v1";
  const K_SRVUSER = "cubalog_srvuser_v1";
  const DATA_KEYS = [
    "cubalog_vehicles_v1", "cubalog_fuel_v1", "cubalog_recargos_v1",
    "cubalog_chofer_v1", "cubalog_gkey_v1", "cubalog_expenses_v1",
    "cubalog_lastroute_v1", "cubalog_selected_vehicle", "cubalog_tasas_v1",
    "cubalog_tasa_manual", "cubalog_fuel_inf_v1", "cubalog_fuel_inf_manual",
    "cubalog_fuel_inf_urls", "cubalog_inf_on", "cubalog_fuel_upd",
    "cubalog_tarifa_v1", "cubalog_hist_v1"
  ];

  const Server = {
    online: false,
    api: async function (payload) {
      const r = await fetch(CL_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      Server.online = true; Server.conn();
      return j;
    },
    ping: async function () {
      try { await Server.api({ action: "ping" }); }
      catch (e) { Server.online = false; Server.conn(); }
      return Server.online;
    },
    conn: function () {
      document.querySelectorAll(".cl-conn").forEach(el => {
        el.style.background = Server.online ? "#22c55e" : "#ef4444";
        el.title = Server.online ? "Conectado a la base de datos" : "Sin conexión con la base de datos";
      });
    },
    mounts: function () {
      const add = (parent, style) => {
        if (!parent || parent.querySelector(".cl-conn")) return;
        const d = document.createElement("span");
        d.className = "cl-conn";
        d.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;flex:none;" + (style || "");
        parent.appendChild(d);
      };
      const chip = document.getElementById("userChipEl");
      if (chip && chip.parentNode) add(chip.parentNode, "margin-left:8px;align-self:center");
      const gate = document.querySelector("#gateEl .gatecard");
      if (gate) add(gate, "position:absolute;top:12px;right:12px");
      Server.conn();
    },
    token: function () { try { return localStorage.getItem(K_TOKEN) || ""; } catch (e) { return ""; } },
    setToken: function (t) { try { t ? localStorage.setItem(K_TOKEN, t) : localStorage.removeItem(K_TOKEN); } catch (e) {} },
    srvUser: function () { try { return JSON.parse(localStorage.getItem(K_SRVUSER) || "null"); } catch (e) { return null; } },
    setSrvUser: function (u) { try { u ? localStorage.setItem(K_SRVUSER, JSON.stringify(u)) : localStorage.removeItem(K_SRVUSER); } catch (e) {} },

    /* El espacio de un usuario = sus claves con nombre, sin el prefijo. */
    collectSpace: function (uid) {
      const out = {};
      DATA_KEYS.forEach(k => {
        try {
          const raw = localStorage.getItem("cubalog_u_" + uid + "_" + k);
          if (raw != null) out[k] = JSON.parse(raw);
        } catch (e) {}
      });
      return out;
    },
    applySpace: function (uid, datos) {
      DATA_KEYS.forEach(k => {
        const key = "cubalog_u_" + uid + "_" + k;
        try {
          if (datos && datos[k] !== undefined) localStorage.setItem(key, JSON.stringify(datos[k]));
          else localStorage.removeItem(key);
        } catch (e) {}
      });
    },
    _timer: null,
    scheduleUpload: function () {
      if (!Server.online || !Server.token()) return;
      clearTimeout(Server._timer);
      Server._timer = setTimeout(async () => {
        const uid = window.Auth && window.Auth.currentUid;
        if (!uid) return;
        try { await Server.api({ action: "data_set", token: Server.token(), datos: Server.collectSpace(uid) }); }
        catch (e) {}
      }, 900);
    },
    hookStore: function () {
      if (!window.Store || Store.__clHooked) return;
      const orig = Store.save.bind(Store);
      Store.save = function (key, val) {
        orig(key, val);
        if (DATA_KEYS.indexOf(key) >= 0) Server.scheduleUpload();
      };
      Store.__clHooked = true;
    }
  };

  window.Server = Server;
})();
