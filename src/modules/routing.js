/* CubaLog — routing.js: geocodificación + distancias + optimización.
   Estrategia en cascada (sin bloquear la app):
   1) Si hay Google Maps cargado con API key -> DirectionsService con optimizeWaypoints.
   2) Si no, Nominatim (OSM) para geocodificar + OSRM público para ruta y TSP (trip).
   3) Si todo falla -> Haversine × 1.32 (factor vial estimado Cuba) + TSP propio.
   Expone: window.Routing = { geocode, haversineKm, osrmRoute, optimize, googleLoaded } */

(function () {
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const OSRM = "https://router.project-osrm.org";
  const geoCache = new Map();

  function haversineKm(a, b) {
    const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
    const h = s1 * s1 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * s2 * s2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function geocode(q) {
    // q: { localidad, municipio, provincia }
    const label = [q.localidad, q.municipio, q.provincia, "Cuba"].filter(x => x && !/otra|exacta/i.test(x)).join(", ");
    const key = label.toLowerCase();
    if (geoCache.has(key)) return geoCache.get(key);
    // 1) intento Nominatim
    try {
      const url = NOMINATIM + "?format=json&limit=1&countrycodes=cu&q=" + encodeURIComponent(label);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { "Accept": "application/json" } });
      clearTimeout(t);
      if (r.ok) {
        const j = await r.json();
        if (j && j.length) {
          const c = [Number(j[0].lat), Number(j[0].lon)];
          const out = { coords: c, label, fuente: "Nominatim/OSM" };
          geoCache.set(key, out); return out;
        }
      }
    } catch (e) { /* sigue a fallback */ }
    // 2) fallback: centro provincial + jitter determinista por municipio (para separar paradas)
    let h = 0; for (const ch of (q.municipio || "")) h = (h * 31 + ch.charCodeAt(0)) % 1000;
    const base = (window.CUBA_GEO && window.CUBA_GEO.COORDS_PROV[q.provincia]) || [21.5, -79.5];
    const c = [base[0] + ((h % 40) - 20) * 0.012, base[1] + ((h % 53) - 26) * 0.012];
    const out = { coords: c, label, fuente: "estimado (sin conexión)" };
    geoCache.set(key, out); return out;
  }

  async function osrmRoute(coords) {
    // coords: [[lat,lon],...] -> { km, min, geometry }
    const str = coords.map(c => c[1] + "," + c[0]).join(";");
    const url = OSRM + "/route/v1/driving/" + str + "?overview=full&geometries=geojson&steps=false";
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("osrm " + r.status);
      const j = await r.json();
      if (j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error("sin ruta");
      const rt = j.routes[0];
      return { km: rt.distance / 1000, min: rt.duration / 60, geometry: rt.geometry, fuente: "OSRM" };
    } catch (e) { clearTimeout(t); throw e; }
  }

  // Mide una secuencia YA ordenada (respeta el orden dado).
  async function medir(coords) {
    try {
      const r = await osrmRoute(coords);
      return { km: r.km, min: r.min, geometry: r.geometry, fuente: "OSRM" };
    } catch (e) {
      let km = 0;
      for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]) * 1.32;
      return { km, min: km / 55 * 60, geometry: null, fuente: "estimada (línea recta × 1.32)" };
    }
  }
  function tspPropio(originIdx, distMatrix) {
    const n = distMatrix.length;
    const resto = []; for (let i = 0; i < n; i++) if (i !== originIdx) resto.push(i);
    if (resto.length <= 1) return [originIdx].concat(resto);
    if (resto.length <= 7) {
      let best = null, bestD = Infinity;
      const perm = (arr, l) => {
        if (l === arr.length) {
          let d = 0, prev = originIdx;
          for (const k of arr) { d += distMatrix[prev][k]; prev = k; }
          if (d < bestD) { bestD = d; best = arr.slice(); }
          return;
        }
        for (let i = l; i < arr.length; i++) {
          const t = arr[l]; arr[l] = arr[i]; arr[i] = t;
          perm(arr, l + 1);
          const t2 = arr[l]; arr[l] = arr[i]; arr[i] = t2;
        }
      };
      perm(resto.slice(), 0);
      return [originIdx].concat(best);
    }
    // nearest neighbor
    const orden = [originIdx]; const vis = new Set([originIdx]);
    let cur = originIdx;
    while (orden.length < n) {
      let bj = -1, bd = Infinity;
      for (let j = 0; j < n; j++) if (!vis.has(j) && distMatrix[cur][j] < bd) { bd = distMatrix[cur][j]; bj = j; }
      orden.push(bj); vis.add(bj); cur = bj;
    }
    return orden;
  }

  function googleLoaded() { return !!(window.google && window.google.maps && window.google.maps.DirectionsService); }

  function googleRoute(coords, labels) {
    return new Promise((resolve, reject) => {
      try {
        const svc = new google.maps.DirectionsService();
        const origin = new google.maps.LatLng(coords[0][0], coords[0][1]);
        const dest = new google.maps.LatLng(coords[coords.length - 1][0], coords[coords.length - 1][1]);
        const mid = coords.slice(1, -1).map(c => ({ location: new google.maps.LatLng(c[0], c[1]), stopover: true }));
        svc.route({ origin, destination: dest, waypoints: mid, optimizeWaypoints: true, travelMode: google.maps.TravelMode.DRIVING }, (res, status) => {
          if (status !== "OK" || !res) return reject(new Error("Google: " + status));
          let m = 0, s = 0; const order = res.routes[0].waypoint_order || [];
          for (const leg of res.routes[0].legs) { m += leg.distance.value; s += leg.duration.value; }
          resolve({ km: m / 1000, min: s / 60, googleOrder: order, polyline: res.routes[0].overview_polyline, fuente: "Google Maps" });
        });
      } catch (e) { reject(e); }
    });
  }

  // El ÚLTIMO punto es siempre "destino final" y queda fijo: solo se
  // optimiza el orden de las paradas intermedias (origen también fijo).
  async function optimize(puntos, opts) {
    opts = opts || {};
    var keepLast = opts.destinoFinalFijo !== false;
    if (puntos.length >= 3 && keepLast) {
      var head = puntos.slice(0, -1), fin = puntos[puntos.length - 1];
      var r = await optimize(head, { destinoFinalFijo: false });
      var seq = r.orden.map(function (i) { return head[i]; }).concat([fin]);
      var med = await medir(seq.map(function (p) { return p.coords; }));
      var ordenFin = r.orden.concat([puntos.length - 1]);
      return { orden: ordenFin, km: med.km, min: med.min, geometry: med.geometry || null, fuente: med.fuente + " · destino final fijo" };
    }
    var coords = puntos.map(function (p) { return p.coords; });
    var n = coords.length;
    if (n <= 1) return { orden: [0], km: 0, min: 0, fuente: "—" };
    // Intento 1: Google si disponible y >1 destino
    if (googleLoaded() && n >= 2) {
      try {
        const g = await googleRoute(coords, puntos.map(p => p.label));
        // reconstruir orden: origen + intermedios reordenados + destino final? Para "ruta inteligente"
        // Google optimizeWaypoints reordena solo waypoints; mantenemos origen fijo y último como final.
        const mids = g.googleOrder.map(i => i + 1);
        return { orden: [0].concat(mids).concat([n - 1]), km: g.km, min: g.min, polyline: g.polyline, fuente: g.fuente };
      } catch (e) { /* cae a OSRM */ }
    }
    // Intento 2: OSRM trip (TSP) + route
    try {
      const str = coords.map(c => c[1] + "," + c[0]).join(";");
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
      const tripUrl = OSRM + "/trip/v1/driving/" + str + "?source=first&roundtrip=false&overview=false";
      const tr = await fetch(tripUrl, { signal: ctrl.signal }); clearTimeout(t);
      if (tr.ok) {
        const tj = await tr.json();
        if (tj.code === "Ok" && tj.trips && tj.trips.length) {
          const order = tj.waypoints.slice().sort((a, b) => a.waypoint_index - b.waypoint_index).map(w => w.nodes !== undefined ? w.waypoint_index : w.waypoint_index);
          // tj.waypoints tiene waypoint_index = posición en la ruta óptima
          const orden = tj.waypoints.map(() => 0);
          tj.waypoints.forEach(w => { orden[w.waypoint_index] = w.nodes === undefined ? null : null; });
          // forma simple y robusta:
          const sorted = tj.waypoints.slice().sort((a, b) => a.waypoint_index - b.waypoint_index).map(w => w.trip_index !== undefined ? w.trip_index : 0);
          // En realidad OSRM trip devuelve waypoints con waypoint_index (orden óptimo) y trips[0].geometry.
          // Reconstruimos: orden óptimo = waypoints ordenados por waypoint_index -> su trip_index es el índice original.
          const opt = tj.waypoints.slice().sort((a, b) => a.waypoint_index - b.waypoint_index).map(w => (w.trip_index !== undefined ? w.trip_index : w.waypoint_index));
          // Asegurar origen primero (source=first ya lo garantiza)
          const rt = await osrmRoute(opt.map(i => coords[i]));
          return { orden: opt, km: rt.km, min: rt.min, geometry: rt.geometry, fuente: "OSRM (ruta óptima)" };
        }
      }
    } catch (e) { /* cae a propio */ }
    // Intento 3: matriz haversine + TSP propio + factor vial
    const D = coords.map(a => coords.map(b => haversineKm(a, b) * 1.32));
    const orden = tspPropio(0, D);
    let km = 0; for (let i = 1; i < orden.length; i++) km += D[orden[i - 1]][orden[i]];
    return { orden, km, min: km / 55 * 60, fuente: "estimada (línea recta × 1.32)" };
  }

  window.Routing = { geocode, haversineKm, osrmRoute, optimize, googleLoaded };
})();
