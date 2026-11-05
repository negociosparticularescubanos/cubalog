/* CubaLog — auth.js: usuarios locales, roles y sesiones.
   - Acceso con usuario + contraseña (hash SHA-256 con sal, 5000 rondas).
   - Un administrador general puede crear usuarios choferes.
   - Cada usuario tiene su espacio de datos aislado (ver Store.nsKey).
   - Seguridad a nivel de dispositivo compartido, no autenticación de servidor.
   Expone: window.Auth */

(function () {
  var K_USERS = "cubalog_users_v1";
  var K_SESSION = "cubalog_session_v1";

  var KNOWN_DATA_KEYS = [
    "cubalog_vehicles_v1", "cubalog_fuel_v1", "cubalog_recargos_v1",
    "cubalog_chofer_v1", "cubalog_gkey_v1", "cubalog_expenses_v1",
    "cubalog_lastroute_v1", "cubalog_selected_vehicle", "cubalog_tasas_v1",
    "cubalog_tasa_manual", "cubalog_fuel_inf_v1", "cubalog_fuel_inf_manual",
    "cubalog_fuel_inf_urls", "cubalog_inf_on", "cubalog_fuel_upd",
    "cubalog_tarifa_v1", "cubalog_hist_v1"
  ];

  function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function randHex(n) { var a = new Uint8Array(n); if ((window.crypto || {}).getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); return hex(a.buffer); }
  async function sha256(s) {
    if (crypto.subtle) return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return "f" + h.toString(16);
  }
  async function hashPass(salt, pass) {
    var h = salt + ":" + pass;
    for (var i = 0; i < 5000; i++) h = await sha256(h + ":" + i);
    return h;
  }
  function slug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "").slice(0, 16) || "usuario";
  }

  var Auth = {
    K_USERS: K_USERS, K_SESSION: K_SESSION,
    currentUid: null,

    users() { return window.Store.loadRaw(K_USERS, []) || []; },
    saveUsers(u) { window.Store.saveRaw(K_USERS, u); },
    session() { return window.Store.loadRaw(K_SESSION, null); },
    setSession(uid) { if (uid) window.Store.saveRaw(K_SESSION, { uid: uid, ts: Date.now() }); else window.Store.removeRaw(K_SESSION); },

    userById(id) { return this.users().find(function (u) { return u.id === id && u.active !== false; }) || null; },
    userByName(username) {
      var un = String(username || "").trim().toLowerCase();
      return this.users().find(function (u) { return (u.username || "").toLowerCase() === un && u.active !== false; }) || null;
    },
    isAdmin(u) { return !!u && u.role === "admin"; },

    validUsername(u) { return /^[a-z0-9._-]{3,20}$/i.test(String(u || "").trim()); },
    validPass(p) { return String(p || "").length >= 4 && String(p || "").length <= 64; },

    async createUser(name, username, password, role, color) {
      name = String(name || "").trim().slice(0, 24) || String(username || "").trim();
      username = String(username || "").trim().toLowerCase();
      if (!this.validUsername(username)) throw new Error("usuario");
      if (!this.validPass(password)) throw new Error("clave");
      var users = this.users();
      if (users.some(function (u) { return (u.username || "").toLowerCase() === username; })) throw new Error("duplicado");
      var salt = randHex(8);
      var u = { id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name, username: username, salt: salt, passHash: await hashPass(salt, password), role: role === "admin" ? "admin" : "driver", color: color || pickColor(users.length), active: true, created: Date.now() };
      users.push(u); this.saveUsers(users);
      return u;
    },

    async verifyPassword(user, password) {
      if (!user || user.active === false) return false;
      return (await hashPass(user.salt, password)) === user.passHash;
    },

    async resetPassword(userId, newPass) {
      if (!this.validPass(newPass)) throw new Error("clave");
      var users = this.users();
      var u = users.find(function (x) { return x.id === userId; });
      if (!u) throw new Error("noexiste");
      u.salt = randHex(8); u.passHash = await hashPass(u.salt, newPass);
      this.saveUsers(users);
    },

    async deleteUser(userId) {
      var users = this.users().filter(function (u) { return u.id !== userId; });
      this.saveUsers(users);
      KNOWN_DATA_KEYS.forEach(function (k) { window.Store.removeRaw("cubalog_u_" + userId + "_" + k); });
      var s = this.session();
      if (s && s.uid === userId) this.setSession(null);
    },

    migrateGlobalsTo(uid) {
      KNOWN_DATA_KEYS.forEach(function (k) {
        var v = window.Store.loadRaw(k, undefined);
        if (v !== undefined) window.Store.saveRaw("cubalog_u_" + uid + "_" + k, v);
      });
    },

    // Cuentas iniciales pedidas por el dueño
    async seedDefaults() {
      var admin = await this.createUser("Administrador", "admin", "adminred", "admin");
      var ch = await this.createUser("Chofer 1", "chofer1", "chofer1", "driver");
      return { admin: admin, driver: ch };
    },

    // Convierte cuentas viejas de PIN (pruebas) a usuario+contraseña sin perder datos
    async migrateLegacyIfNeeded() {
      var users = this.users();
      if (!users.length || !users.some(function (u) { return !u.username; })) return false;
      var used = {};
      users.forEach(function (u) { if (u.username) used[u.username.toLowerCase()] = 1; });
      var nDriver = 0;
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (u.username) continue;
        if (u.role === "admin" && !used["admin"]) {
          u.username = "admin"; u.name = "Administrador";
          u.salt = randHex(8); u.passHash = await hashPass(u.salt, "adminred");
          used["admin"] = 1;
        } else {
          nDriver++;
          var un = (nDriver === 1 && !used["chofer1"]) ? "chofer1" : slug(u.name);
          if (used[un]) un = (un + i).slice(0, 20);
          var pw = (un === "chofer1") ? "chofer1" : un + "1234";
          u.username = un; if (!u.name) u.name = un;
          u.salt = randHex(8); u.passHash = await hashPass(u.salt, pw);
          used[un] = 1;
        }
        delete u.pinHash;
      }
      this.saveUsers(users);
      return true;
    },

    exportAll() {
      var out = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("cubalog_") === 0) { try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }
      }
      out.__meta = { app: "CubaLog", exported: new Date().toISOString(), users: this.users().map(function (u) { return { username: u.username, name: u.name, role: u.role }; }) };
      return out;
    },

    importAll(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("formato");
      var n = 0;
      Object.keys(obj).forEach(function (k) {
        if (k === "__meta") return;
        if (k.indexOf("cubalog_") !== 0) return;
        try { localStorage.setItem(k, JSON.stringify(obj[k])); n++; } catch (e) {}
      });
      return n;
    }
  };

  function pickColor(i) {
    var pal = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e24", "#ef4444", "#ec4899", "#14b8a6", "#f97316"];
    return pal[i % pal.length];
  }

  Auth.currentUid = (function () { try { var s = window.Store.loadRaw(K_SESSION, null); return (s && s.uid) || null; } catch (e) { return null; } })();

  window.Auth = Auth;
})();
