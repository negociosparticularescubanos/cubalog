/* CubaLog — app.js (lógica principal). Clásico (sin modules) para convivir con el motor Perchance. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const K = window.Store.keys;

  /* ---------- estado ---------- */
  let vehicles = window.Store.load(K.vehicles, []);
  let selectedVehicleId = window.Store.load("cubalog_selected_vehicle", null);
  let expenses = window.Store.load(K.expenses, []);
  let destCount = 0;

  if (!vehicles.length) {
    vehicles = [
      { id: uid(), marca: "Hyundai", modelo: "Accent", chapa: "P 123 456", consumoValor: 6.8, consumoUnidad: "L/100km", combustible: "Gasolina Especial", imagen: "" },
      { id: uid(), marca: "Lada", modelo: "2107", chapa: "P 987 654", consumoValor: 9.5, consumoUnidad: "L/100km", combustible: "Gasolina Regular", imagen: "" }
    ];
    window.Store.save(K.vehicles, vehicles);
  }

  /* ---------- helpers UI ---------- */
  function toast(msg) {
    const t = $("toastEl"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function fmt(n, d) { return Number(n || 0).toLocaleString("es-CU", { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }); }
  function carAvatar(v, big) {
    const ini = ((v.marca || "?")[0] + "").toUpperCase();
    const col = (window.findVehicle(v.marca, v.modelo, 1)[0] || {}).color || "#0ea5e9";
    if (v.imagen) return '<img src="' + esc(v.imagen) + '" loading="lazy" onerror="this.outerHTML=\'' + ("<div class='avatar' style=\"background:"+col+"\">"+ini+"</div>").replace(/'/g, "\\'") + '\'" class="' + (big ? "carimg" : "carthumb") + '" alt="auto">';
    return "<div class='" + (big ? "carimg dflt" : "avatar") + "' style='background:" + col + "'>" + esc(ini) + "</div>";
  }

  /* ---------- tabs ---------- */
  function goTab(name) {
    document.querySelectorAll(".tabpage").forEach(s => { s.hidden = s.dataset.tab !== name; });
    document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "mapa" || name === "viaje") setTimeout(() => { if (window._map) window._map.invalidateSize(); }, 80);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.goTab = goTab;

  /* ---------- cascadas geográficas ---------- */
  function fillProv(sel) {
    sel.innerHTML = "<option value=''>Provincia…</option>" + window.CUBA_GEO.PROVINCIAS.map(p => "<option>" + esc(p) + "</option>").join("");
  }
  function fillMuni(prov, sel) {
    const ms = window.CUBA_GEO.municipiosDe(prov);
    sel.innerHTML = "<option value=''>Municipio…</option>" + ms.map(m => "<option>" + esc(m) + "</option>").join("");
    sel.disabled = !ms.length;
  }
  function fillLoc(muni, sel) {
    const ls = window.CUBA_GEO.localidadesDe(muni);
    sel.innerHTML = "<option value=''>Localidad…</option>" + ls.map(l => "<option>" + esc(l) + "</option>").join("");
    sel.disabled = !ls.length;
  }
  function wireCascade(pS, mS, lS, cI) {
    fillProv(pS);
    pS.addEventListener("change", () => { fillMuni(pS.value, mS); mS.value = ""; lS.innerHTML = "<option value=''>Localidad…</option>"; lS.disabled = true; if (cI) { cI.hidden = true; cI.value = ""; } });
    mS.addEventListener("change", () => { fillLoc(mS.value, lS); if (cI) { cI.hidden = true; cI.value = ""; } });
    lS.addEventListener("change", () => { if (cI) { const libre = /otra|exacta/i.test(lS.value); cI.hidden = !libre; if (!libre) cI.value = ""; if (libre) cI.focus(); } });
  }
  function puntoDe(pS, mS, lS, cI) {
    let loc = lS.value || "";
    if (/otra|exacta/i.test(loc) && cI && cI.value.trim()) loc = cI.value.trim() + " (libre)";
    return { prov: pS.value, muni: mS.value, loc, custom: (cI && !cI.hidden) ? cI.value.trim() : "" };
  }
  function puntoValido(p) { return !!(p.prov && p.muni && p.loc); }
  function etiqueta(p) { return [p.loc, p.muni, p.prov].filter(Boolean).join(", "); }

  /* ---------- destinos dinámicos ---------- */
  function addDestino(pref) {
    destCount++;
    const id = "dest" + destCount + "_" + Date.now().toString(36);
    const tpl = $("destTpl");
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector(".destcard");
    card.dataset.did = id;
    card.querySelector(".destnum").textContent = document.querySelectorAll(".destcard").length + 1;
    if (pref) card.querySelector(".destdel").hidden = false;
    $("destsCtn").appendChild(node);
    const last = $("destsCtn").querySelector('[data-did="' + id + '"]');
    wireCascade(last.querySelector(".dprov"), last.querySelector(".dmuni"), last.querySelector(".dloc"), last.querySelector(".dcustom"));
    last.querySelector(".destdel").onclick = () => { last.remove(); renumDest(); };
    renumDest();
    return last;
  }
  function renumDest() {
    const cards = [...document.querySelectorAll(".destcard")];
    cards.forEach((c, i) => {
      const isFin = i === cards.length - 1;
      c.querySelector(".destnum").textContent = isFin ? "🏁" : (i + 1);
      const t = c.querySelector(".desthead b"); if (t) t.textContent = isFin ? "Destino final" : "Destino";
      c.classList.toggle("final", isFin);
    });
  }
  function leerDestinos() {
    return [...document.querySelectorAll(".destcard")].map(c => puntoDe(c.querySelector(".dprov"), c.querySelector(".dmuni"), c.querySelector(".dloc"), c.querySelector(".dcustom")));
  }

  /* ---------- vehículos ---------- */
  function consumoLkm(v) { return toLitersPerKm(v.consumoValor, v.consumoUnidad); }
  function renderVehicles() {
    const c = $("carListCtn"); if (!c) return;
    if (!vehicles.length) { c.innerHTML = "<p class='muted'>Sin vehículos. Registra el primero arriba.</p>"; renderVehSelect(); return; }
    c.innerHTML = vehicles.map(v => {
      const sel = v.id === selectedVehicleId;
      return "<article class='carcard" + (sel ? " sel" : "") + "'>" +
        carAvatar(v, false) +
        "<div class='carinfo'><b>" + esc(v.marca) + " " + esc(v.modelo) + "</b>" +
        "<span class='chapa'>" + esc(v.chapa || "sin chapa") + "</span>" +
        "<span class='muted sm'>" + esc(String(v.consumoValor)) + " " + esc(v.consumoUnidad) + " · " + esc(v.combustible) + "</span></div>" +
        "<div class='carbtns'>" +
        (sel ? "<span class='pill'>En uso</span>" : "<button class='btn xs' data-usar='" + v.id + "'>Usar</button>") +
        "<button class='btn xs ghost' data-edit='" + v.id + "'>Editar</button>" +
        "<button class='btn xs danger' data-del='" + v.id + "'>✕</button>" +
        "</div></article>";
    }).join("");
    c.querySelectorAll("[data-usar]").forEach(b => b.onclick = () => { selectedVehicleId = b.dataset.usar; window.Store.save("cubalog_selected_vehicle", selectedVehicleId); renderVehicles(); renderVehSelect(); toast("Vehículo seleccionado"); });
    c.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => loadVehForm(vehicles.find(x => x.id === b.dataset.edit)));
    c.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      if (!confirm("¿Eliminar este vehículo?")) return;
      vehicles = vehicles.filter(x => x.id !== b.dataset.del);
      window.Store.save(K.vehicles, vehicles);
      if (selectedVehicleId === b.dataset.del) selectedVehicleId = vehicles[0] ? vehicles[0].id : null;
      renderVehicles(); renderVehSelect(); toast("Vehículo eliminado");
    });
    renderVehSelect();
  }
  function renderVehSelect() {
    const s = $("vehSel"); if (!s) return;
    s.innerHTML = vehicles.map(v => "<option value='" + v.id + "'>" + esc(v.marca + " " + v.modelo + " · " + (v.chapa || "")) + "</option>").join("");
    if (selectedVehicleId && vehicles.some(v => v.id === selectedVehicleId)) s.value = selectedVehicleId;
    else if (vehicles[0]) { selectedVehicleId = vehicles[0].id; s.value = selectedVehicleId; }
    const v = vehicles.find(x => x.id === s.value);
    $("vehResumeEl").innerHTML = v ? (carAvatar(v, false) + "<div><b>" + esc(v.marca + " " + v.modelo) + "</b><br><span class='muted sm'>" + esc(String(v.consumoValor) + " " + v.consumoUnidad + " · " + v.combustible) + "</span></div>") : "<span class='muted'>Registra un carro primero.</span>";
  }
  function loadVehForm(v) {
    if (!v) return;
    $("vMarcaInput").value = v.marca || ""; $("vModeloInput").value = v.modelo || "";
    $("vChapaInput").value = v.chapa || ""; $("vConsInput").value = v.consumoValor || "";
    $("vUnidadSel").value = v.consumoUnidad || "L/100km"; $("vCombSel").value = v.combustible || "Gasolina Especial";
    $("vImgInput").value = v.imagen || ""; $("vehFormTitleEl").textContent = "Editar vehículo";
    $("vehSaveBtn").dataset.editing = v.id;
    $("vehCancelBtn").hidden = false;
    goTab("carros"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearVehForm() {
    ["vMarcaInput", "vModeloInput", "vChapaInput", "vConsInput", "vImgInput"].forEach(id => $(id).value = "");
    $("vUnidadSel").value = "L/100km"; $("vehFormTitleEl").textContent = "Nuevo vehículo";
    delete $("vehSaveBtn").dataset.editing; $("vehCancelBtn").hidden = true; $("vehSugCtn").innerHTML = "";
  }

  // Búsqueda simulada/real en catálogo ("busca en internet")
  let searchTimer = null;
  function buscarSugerencias() {
    const m = $("vMarcaInput").value, mo = $("vModeloInput").value;
    const res = window.findVehicle(m, mo, 4);
    const c = $("vehSugCtn");
    if (!res.length) { c.innerHTML = m || mo ? "<p class='muted sm'>Sin coincidencias. Pulsa «Buscar ficha en internet».</p>" : ""; return; }
    c.innerHTML = "<p class='sm muted'>¿Quisiste decir…?</p>" + res.map((r, i) =>
      "<button class='sug' data-sug='" + i + "'><b>" + esc(r.marca + " " + r.modelo) + "</b><span>" + esc(r.consumoL100 + " L/100km · " + r.combustible) + "</span></button>").join("");
    c.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => aplicarFicha(res[Number(b.dataset.sug)]));
  }
  function aplicarFicha(r) {
    $("vMarcaInput").value = r.marca; $("vModeloInput").value = r.modelo;
    $("vConsInput").value = r.consumoL100; $("vUnidadSel").value = "L/100km"; $("vCombSel").value = r.combustible;
    toast("Ficha aplicada: " + r.marca + " " + r.modelo);
  }
  async function buscarInternet() {
    const m = $("vMarcaInput").value.trim(), mo = $("vModeloInput").value.trim();
    if (!m && !mo) { toast("Escribe marca y modelo primero"); return; }
    const b = $("vehSearchBtn"); b.disabled = true; b.textContent = "Buscando en internet…";
    $("vehSugCtn").innerHTML = "<p class='sm muted pulse'>Consultando fichas técnicas y analizando consumo…</p>";
    await new Promise(r => setTimeout(r, 1100)); // latencia simulada de red
    const res = window.findVehicle(m, mo, 1);
    b.disabled = false; b.textContent = "⌕ Buscar ficha en internet";
    if (res.length) {
      aplicarFicha(res[0]);
      $("vehSugCtn").innerHTML = "<p class='sm ok'>✓ Ficha encontrada: consumo estimado, combustible e imagen asignados. Verifica la chapa.</p>";
    } else {
      // Estimación heurística si no hay ficha (para no bloquear al usuario)
      const est = 7.5;
      $("vConsInput").value = est; $("vUnidadSel").value = "L/100km";
      if (!$("vCombSel").value) $("vCombSel").value = "Gasolina Especial";
      $("vehSugCtn").innerHTML = "<p class='sm warn'>No se encontró ficha exacta. Se estimó 7.5 L/100km — ajústalo manualmente.</p>";
    }
  }

  /* ---------- combustible / ajustes ---------- */
  function renderFuel() {
    const all = window.Fuel.getAll();
    const c = $("fuelListCtn");
    c.innerHTML = Object.keys(all).map(k =>
      "<label class='fuelrow'><span>" + esc(k) + " <small class='muted'>CUP/L</small><br><small class='muted' data-fusd='" + esc(all[k]) + "'></small></span>" +
      "<input type='number' min='0' step='0.01' data-fuel='" + esc(k) + "' value='" + esc(all[k]) + "'></label>").join("") +
      "<p class='muted sm'>Última actualización: <b id='fuelUpdEl'>" + esc(window.Store.load("cubalog_fuel_upd", "precios base 2025")) + "</b></p>";
    c.querySelectorAll("[data-fuel]").forEach(inp => inp.onchange = () => {
      const o = window.Fuel.getAll(); o[inp.dataset.fuel] = Number(inp.value) || 0;
      window.Fuel.setAll(o);
      const hint = inp.closest(".fuelrow").querySelector("[data-fusd]");
      if (hint) hint.dataset.fusd = o[inp.dataset.fuel];
      paintFuelUsd(); toast("Precio guardado");
    });
    const rec = window.Recargos.getAll();
    $("recPasInput").value = rec["Pasajeros"]; $("recCarInput").value = rec["Carga"]; $("recMixInput").value = rec["Pasajeros con Carga"];
    $("chofPctInput").value = window.Store.load(K.chofer, 10);
    $("gkeyInput").value = window.Store.load(K.gkey, "");
  }
  async function fetchFuelOnline() {
    const b = $("fuelAutoBtn"); b.disabled = true; b.textContent = "Consultando…";
    await new Promise(r => setTimeout(r, 1200));
    // Simulación de API/scraping: pequeña variación sobre precios guardados + sello de tiempo.
    const o = window.Fuel.getAll();
    for (const k of Object.keys(o)) { const v = Number(o[k]) || 0; o[k] = Math.round((v * (1 + (Math.random() * 0.04 - 0.02))) * 100) / 100; }
    window.Fuel.setAll(o);
    window.Store.save("cubalog_fuel_upd", new Date().toLocaleString("es-CU") + " (auto)");
    b.disabled = false; b.textContent = "⇄ Actualizar precios automáticamente";
    renderFuel(); toast("Precios actualizados (fuente simulada)");
  }
  /* ---------- modelo tarifario + historial ---------- */
  const K_TARIFA = "cubalog_tarifa_v1", K_HIST = "cubalog_hist_v1";
  function tarifaCfg() {
    return Object.assign({ banderazo: 150, porKm: 45, porMin: 8, minimo: 200, retorno: 50, nocturno: 1.25 },
      window.Store.load(K_TARIFA, {}) || {});
  }
  function renderTarifa() {
    const t = tarifaCfg();
    $("tarBandInput").value = t.banderazo; $("tarKmInput").value = t.porKm; $("tarMinInput").value = t.porMin;
    $("tarMinimoInput").value = t.minimo; $("tarRetInput").value = t.retorno; $("tarNocInput").value = t.nocturno;
    ["tarBandInput", "tarKmInput", "tarMinInput", "tarMinimoInput"].forEach(id => $(id).oninput = paintTarUsd);
    paintTarUsd();
  }
  function esNocturnoAhora() { const h = new Date().getHours(); return h >= 22 || h < 5; }
  function getHist() { return window.Store.load(K_HIST, []); }
  function pushHist(e) {
    const h = getHist(); h.unshift(e);
    window.Store.save(K_HIST, h.slice(0, 30));
    renderHist();
  }
  function renderHist() {
    const h = getHist(), sec = $("histSec"), c = $("histCtn");
    if (!sec || !c) return;
    sec.hidden = !h.length;
    c.innerHTML = h.map(x => {
      let p;
      if (typeof x.precio === "number") p = fmt2(x.precio);
      else {
        const m = String(x.precio || "").replace(/,/g, "").match(/[\d.]+/);
        p = m ? fmt2(Number(m[0])) : esc(x.precio);
      }
      return "<div class='exprow'><div><b>" + esc(x.o) + " → " + esc(x.d) + "</b><br><span class='muted sm'>" + esc(x.f) + " · " + esc(String(x.km)) + " km</span></div><div class='expmonto'>" + p + "</div></div>";
    }).join("");
  }
  function waLink(texto) { return "https://wa.me/?text=" + encodeURIComponent(texto); }

  /* ---------- doble precio CUP/USD en todo ---------- */
  let lastUSD = 0;
  function fmt2(n) {
    n = Number(n) || 0;
    return fmt(n, 2) + " CUP" + (lastUSD > 0 ? " (≈ " + fmt(n / lastUSD, 2) + " USD)" : "");
  }
  function paintFuelUsd() {
    document.querySelectorAll("[data-fusd]").forEach(el => {
      const v = Number(el.dataset.fusd) || 0;
      el.textContent = lastUSD > 0 && v > 0 ? "≈ " + fmt(v / lastUSD, 2) + " USD/L" : "";
    });
  }
  function paintTarUsd() {
    const el = $("tarUsdEl"); if (!el) return;
    const g = id => Number($(id).value) || 0;
    el.textContent = lastUSD > 0
      ? ("Equivale a: banderazo ≈ " + fmt(g("tarBandInput") / lastUSD, 2) + " USD · km ≈ " + fmt(g("tarKmInput") / lastUSD, 2) + " USD · min ≈ " + fmt(g("tarMinInput") / lastUSD, 2) + " USD · mínima ≈ " + fmt(g("tarMinimoInput") / lastUSD, 2) + " USD")
      : "";
  }

  /* ---------- tasa informal elToque + precio informal ---------- */
  function updateTasaBadge(t) {
    const el = $("tasaBadgeEl"); if (!el) return;
    lastUSD = (t && Number(t.USD)) || window.Tasas.cachedUSD() || 0;
    if (t && Number(t.USD) > 0) el.innerHTML = "💵 1 USD ≈ <b>" + fmt(Number(t.USD), 2) + " CUP</b> <span class='muted'>(" + esc(t.fuente || "") + (t.fecha ? " · " + esc(t.fecha) : "") + ")</span>";
    else el.innerHTML = "<span class='muted'>Tasa USD no disponible (sin conexión). Puedes fijarla manual en Ajustes.</span>";
    // repintar todo precio CUP visible con su ≈ USD
    try { renderExpenses(); renderHist(); paintFuelUsd(); paintTarUsd(); } catch (e) {}
  }
  function paintTasasBox(t) {
    const el = $("tasasBoxEl"); if (!el) return;
    if (t && Number(t.USD) > 0) {
      el.innerHTML = "<b>USD:</b> " + fmt(Number(t.USD), 2) + " &nbsp; <b>EUR:</b> " + (Number(t.EUR) > 0 ? fmt(Number(t.EUR), 2) : "—") + " &nbsp; <b>MLC:</b> " + (Number(t.MLC) > 0 ? fmt(Number(t.MLC), 2) : "—") +
        "<br><span class='muted sm'>" + esc(t.fuente || "") + (t.fecha ? " · " + esc(t.fecha) : "") + (t.fresca ? " · fresca" : " · guardada") + "</span>";
    } else el.innerHTML = "<span class='muted'>Sin tasa. Conéctate o fija el USD manual.</span>";
  }
  function renderTasas() {
    const T = window.Tasas; if (!T) return;
    const inf = T.getInfSettings();
    $("infToggle").checked = inf.on !== false;
    const fk = Object.keys(window.Fuel.getAll());
    $("infFuelCtn").innerHTML = fk.map(k =>
      "<label class='fuelrow'><span>" + esc(k) + " <small class='muted'>informal CUP/L</small></span>" +
      "<input type='number' min='0' step='0.01' data-inf='" + esc(k) + "' value='" + esc((inf.manual || {})[k] || "") + "' placeholder='—'></label>").join("");
    $("infUrlsInput").value = (inf.urls || []).join("\n");
    $("tasaManualInput").value = T.getManualUSD() || "";
    paintInfStatus(inf.cache);
    T.getTasas({ soloCache: true }).then(t => { paintTasasBox(t); updateTasaBadge(t); });
  }
  function paintInfStatus(cc) {
    const el = $("infStatusEl"); if (!el) return;
    el.textContent = (cc && cc.precios && Object.keys(cc.precios).length)
      ? ("Guardado: " + Object.keys(cc.precios).map(k => k + " " + cc.precios[k]).join(" · ") + " — " + (cc.fecha || ""))
      : "Sin datos informales aún. Pega páginas fuente o escribe precios manuales.";
  }
  async function refreshTasas(btn) {
    const b = btn || $("tasaRefreshBtn");
    const old = b.textContent; b.disabled = true; b.textContent = "Consultando…";
    try { const t = await window.Tasas.getTasas(); paintTasasBox(t); updateTasaBadge(t); toast(t.fresca ? "Tasa actualizada (" + t.fuente + ")" : "Sin conexión: se usa valor guardado/manual"); }
    catch (e) { toast("No se pudo consultar la tasa"); }
    b.disabled = false; b.textContent = old;
  }
  async function revisarInformal(btn) {
    const b = btn || $("infCheckBtn");
    const old = b.textContent; b.disabled = true; b.textContent = "Revisando páginas…";
    try {
      // guarda primero las URLs del textarea para usarlas ya
      const urls = $("infUrlsInput").value.split("\n").map(s => s.trim()).filter(Boolean);
      const cur = window.Tasas.getInfSettings(); cur.urls = urls; window.Tasas.setInfSettings(cur);
      const r = await window.Tasas.getFuelInformal();
      paintInfStatus(r.fresca ? r : window.Tasas.getInfSettings().cache);
      // rellena los campos manuales vacíos con lo encontrado
      document.querySelectorAll("[data-inf]").forEach(inp => { if (!inp.value && r.precios[inp.dataset.inf]) inp.value = r.precios[inp.dataset.inf]; });
      toast(r.fresca ? "Precio informal encontrado" : (Object.keys(r.precios).length ? "Se usan valores manuales/guardados" : "Nada encontrado: escribe el precio manual"));
    } catch (e) { toast("No se pudo revisar"); }
    b.disabled = false; b.textContent = old;
  }

  function saveAjustes() {
    window.Recargos.setAll({ "Pasajeros": Number($("recPasInput").value) || 0, "Carga": Number($("recCarInput").value) || 0, "Pasajeros con Carga": Number($("recMixInput").value) || 0 });
    let ch = Number($("chofPctInput").value); if (!isFinite(ch) || ch < 0 || ch >= 50) ch = 10;
    window.Store.save(K.chofer, ch);
    window.Store.save(K.gkey, $("gkeyInput").value.trim());
    loadGoogle($("gkeyInput").value.trim());
    // tasa + informal
    window.Tasas.setManualUSD(Number($("tasaManualInput").value) || 0);
    const man = {};
    document.querySelectorAll("[data-inf]").forEach(inp => { if (Number(inp.value) > 0) man[inp.dataset.inf] = Number(inp.value); });
    window.Tasas.setInfSettings({ on: $("infToggle").checked, manual: man, urls: $("infUrlsInput").value.split("\n").map(s => s.trim()).filter(Boolean) });
    window.Store.save(K_TARIFA, { banderazo: Number($("tarBandInput").value) || 0, porKm: Number($("tarKmInput").value) || 0, porMin: Number($("tarMinInput").value) || 0, minimo: Number($("tarMinimoInput").value) || 0, retorno: Number($("tarRetInput").value) || 0, nocturno: Number($("tarNocInput").value) || 1 });
    toast("Ajustes guardados");
  }

  /* ---------- Google Maps (opcional) ---------- */
  let googleLoading = false;
  function loadGoogle(key) {
    if (!key) return;
    if (window.google && window.google.maps) return;
    if (googleLoading) return; googleLoading = true;
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&libraries=places";
    s.async = true; s.defer = true;
    s.onload = () => { googleLoading = false; toast("Google Maps activado"); };
    s.onerror = () => { googleLoading = false; toast("No se pudo cargar Google (revisa la key). Se usa OSRM."); };
    document.head.appendChild(s);
  }

  /* ---------- mapa Leaflet ---------- */
  let map, layerRoute, layerMarks;
  function initMap() {
    if (window._map || !$("mapEl")) return;
    map = L.map("mapEl").setView([21.5, -79.5], 6);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Esri · OpenStreetMap · OSRM" }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
    layerRoute = L.layerGroup().addTo(map); layerMarks = L.layerGroup().addTo(map);
    window._map = map;
  }
  function drawRoute(puntos, geometry, orden) {
    layerRoute.clearLayers(); layerMarks.clearLayers();
    const seq = orden ? orden.map(i => puntos[i]) : puntos;
    seq.forEach((p, i) => {
      const isFin = seq.length > 1 && i === seq.length - 1;
      L.marker(p.coords, { title: p.label }).addTo(layerMarks)
        .bindPopup("<b>" + (i === 0 ? "Origen" : (isFin ? "🏁 Destino final" : "Parada " + i)) + "</b><br>" + esc(p.label));
    });
    try {
      if (geometry && geometry.coordinates) {
        const latlngs = geometry.coordinates.map(c => [c[1], c[0]]);
        L.polyline(latlngs, { weight: 5, opacity: 0.9 }).addTo(layerRoute);
        map.fitBounds(L.polyline(latlngs).getBounds().pad(0.15));
        return;
      }
      if (seq.length > 1) {
        L.polyline(seq.map(p => p.coords), { weight: 4, dashArray: "8 8", opacity: 0.85 }).addTo(layerRoute);
        map.fitBounds(L.polyline(seq.map(p => p.coords)).getBounds().pad(0.2));
      } else map.setView(seq[0].coords, 11);
    } catch (e) {}
  }

  /* ---------- cálculo de ruta ---------- */
  function gastosTotal() { return expenses.reduce((a, e) => a + (Number(e.monto) || 0), 0); }

  async function calcular(optimizar) {
    const v = vehicles.find(x => x.id === $("vehSel").value);
    if (!v) { toast("Selecciona un vehículo"); goTab("carros"); return; }
    const origen = puntoDe($("oProvSel"), $("oMuniSel"), $("oLocSel"), $("oCustomInput"));
    const dests = leerDestinos();
    if (!puntoValido(origen)) { toast("Completa el punto de partida"); return; }
    if (!dests.length || !dests.some(puntoValido)) { toast("Añade al menos un destino válido"); return; }
    const validDests = dests.filter(puntoValido);
    const tipo = document.querySelector("input[name='tripType']:checked").value;

    const btn = optimizar ? $("optBtn") : $("calcBtn");
    const old = btn.textContent; btn.disabled = true;
    btn.textContent = optimizar ? "Optimizando ruta…" : "Geocodificando y calculando…";
    $("routeStatusEl").innerHTML = "<span class='pulse'>Localizando puntos en Cuba…</span>";

    try {
      const todos = [origen].concat(validDests);
      const geo = [];
      for (const p of todos) {
        $("routeStatusEl").innerHTML = "<span class='pulse'>Localizando: " + esc(etiqueta(p)) + "…</span>";
        const g = await window.Routing.geocode({ localidad: p.loc, municipio: p.muni, provincia: p.prov });
        geo.push({ label: etiqueta(p), coords: g.coords, fuente: g.fuente });
      }
      let orden = geo.map((_, i) => i), km = 0, min = 0, fuente = "", geometry = null, polyline = null;
      if (optimizar || geo.length > 2) {
        $("routeStatusEl").innerHTML = "<span class='pulse'>Optimizando orden de paradas…</span>";
        const r = await window.Routing.optimize(geo);
        orden = r.orden; km = r.km; min = r.min; fuente = r.fuente; geometry = r.geometry || null; polyline = r.polyline || null;
      } else {
        try {
          const r = await window.Routing.osrmRoute(geo.map(g => g.coords));
          km = r.km; min = r.min; fuente = r.fuente; geometry = r.geometry;
        } catch (e) {
          km = 0; for (let i = 1; i < geo.length; i++) km += window.Routing.haversineKm(geo[i - 1].coords, geo[i].coords) * 1.32;
          min = km / 55 * 60; fuente = "estimada (línea recta × 1.32)";
        }
      }
      drawRoute(geo, geometry, orden);

      // API informal revisada AL CALCULAR: tasa elToque (para USD) + precio informal del combustible
      $("routeStatusEl").innerHTML = "<span class='pulse'>Consultando tasa elToque y precio informal…</span>";
      let tasa = { USD: 0 };
      try { tasa = await window.Tasas.getTasas(); } catch (e) {}
      updateTasaBadge(tasa);
      let precioL = window.Fuel.get(v.combustible), precioFuente = "oficial (manual, Ajustes)";
      try {
        const inf = window.Tasas.getInfSettings();
        if (inf.on) {
          const infRes = await window.Tasas.getFuelInformal();
          const pi = Number(infRes.precios[v.combustible]) || 0;
          if (pi > 0) {
            precioL = pi;
            precioFuente = "informal (" + infRes.fecha + (infRes.fuentes.length ? " · " + infRes.fuentes.length + " fuente web" : " · manual") + ")";
          } else {
            const pm = Number((inf.manual || {})[v.combustible]) || 0;
            if (pm > 0) { precioL = pm; precioFuente = "informal manual (Ajustes)"; }
          }
        }
      } catch (e) {}

      const rec = window.Recargos.getAll();
      const calc = window.Calc.calcular({
        km, consumoLkm: consumoLkm(v), precioL,
        tipoViaje: tipo, pctRecargo: rec[tipo] ?? 0,
        gastosDiarios: gastosTotal(), pctChofer: window.Store.load(K.chofer, 10)
      });

      const ordenLabels = orden.map(i => geo[i].label);
      // Referencia estilo app (La Nave/Yango) + pasaje por persona
      const tc = tarifaCfg();
      const horaNoc = esNocturnoAhora();
      const noc = $("nocToggle").checked || horaNoc;
      if (horaNoc && !$("nocToggle").checked) { $("nocToggle").checked = true; }
      const paxN = Math.max(1, Math.round(Number($("paxInput").value) || 1));
      const tar = window.Calc.tarifa({ km: calc.km, min: min, banderazo: tc.banderazo, porKm: tc.porKm, porMin: tc.porMin, minimo: tc.minimo, multNocturno: tc.nocturno, esNocturno: noc, idaVuelta: $("rtToggle").checked, factorRetorno: (Number(tc.retorno) || 0) / 100, pasajeros: paxN });
      renderResultados({ v, tipo, precioL, precioFuente, tasaUSD: Number(tasa.USD) || 0, calc, km, min, fuente, ordenLabels, geo, tar, idaVuelta: $("rtToggle").checked });
      pushHist({ f: new Date().toLocaleString("es-CU"), o: geo[0].label.split(",").slice(0, 2).join(","), d: ordenLabels[ordenLabels.length - 1].split(",").slice(0, 2).join(","), km: calc.km, precio: calc.precioFinal });
      window.Store.save(K.lastRoute, { ordenLabels, km: calc.km, fecha: Date.now() });
      $("routeStatusEl").innerHTML = "✓ " + esc(fuente) + " · " + ordenLabels.length + " puntos";
    } catch (e) {
      console.error(e);
      $("routeStatusEl").textContent = "Error de red. Revisa tu conexión e inténtalo de nuevo.";
      toast("Error calculando la ruta");
    } finally { btn.disabled = false; btn.textContent = old; }
  }

  function renderResultados(r) {
    const c = $("resCtn"); if (!c) return;
    const usd = x => (r.tasaUSD > 0 ? " · ≈ " + fmt(x / r.tasaUSD, 2) + " USD" : "");
    const card = (t, val, sub) => "<div class='rescard'><span class='rest'>" + t + "</span><b class='resv'>" + val + "</b><span class='ress'>" + (sub || "") + "</span></div>";
    c.innerHTML =
      card("Distancia total", fmt(r.calc.km, 1) + " km", "optimizada · " + esc(r.fuente)) +
      card("Combustible", fmt(r.calc.litros, 2) + " L", fmt(r.calc.costoComb, 2) + " CUP" + usd(r.calc.costoComb) + " · " + esc(r.v.combustible) + " a " + fmt(r.precioL, 2) + "/L") +
      card("Recargo · " + esc(r.tipo), "+" + fmt(r.calc.recargo, 2) + " CUP", r.calc.pctRecargo + "% sobre combustible") +
      card("Gastos del día", fmt(r.calc.gastosDiarios, 2) + " CUP", expenses.length + " registros") +
      card("Chofer (" + r.calc.pctChofer + "%)", fmt(r.calc.chofer, 2) + " CUP" + usd(r.calc.chofer), "ganancia neta del chofer") +
      card("Referencia estilo app", fmt(r.tar.total, 2) + " CUP" + usd(r.tar.total), "banderazo " + fmt(r.tar.banderazo, 0) + " + " + fmt(r.tar.kmFacturados, 1) + " km" + (r.idaVuelta ? " ida/vuelta" : "") + (r.tar.esNocturno ? " · nocturno ×" + r.tar.mult : "")) +
      card("Pasaje por persona ×" + r.tar.pasajeros, fmt(r.tar.porPersona, 2) + " CUP" + usd(r.tar.porPersona), "como los boteros: total ÷ pasajeros") +
      "<div class='rescard total'><span class='rest'>Precio final al cliente</span><b class='resv'>" + fmt(r.calc.precioFinal, 2) + " CUP</b><span class='ress'>≈ " + (r.tasaUSD > 0 ? fmt(r.calc.precioFinal / r.tasaUSD, 2) + " USD · 1 USD = " + fmt(r.tasaUSD, 2) + " CUP (elToque)" : "tasa USD no disponible") + " · " + esc(r.v.marca + " " + r.v.modelo) + "</span></div>";
    const n = r.ordenLabels.length;
    $("itinerarioEl").innerHTML = "<b>Itinerario optimizado — último punto = destino final:</b><ol>" +
      r.ordenLabels.map((l, i) => "<li>" + (i === 0 ? "🟢 Origen: " : (i === n - 1 && n > 1 ? "🏁 Destino final: " : "📍 Parada " + i + ": ")) + esc(l) + "</li>").join("") + "</ol>" +
      "<p class='muted sm'>Precio usado: <b>" + fmt2(r.precioL) + "/L</b> (" + esc(r.precioFuente) + "). Duración estimada: " + fmt(r.calc.km / 55, 1) + " h a ~55 km/h promedio.</p>";
    $("resSec").hidden = false;
    $("resSec").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- gastos diarios ---------- */
  function renderExpenses() {
    const c = $("expListCtn"); if (!c) return;
    if (!expenses.length) c.innerHTML = "<p class='muted'>Sin gastos hoy. Todo lo que registres se suma al precio final.</p>";
    else c.innerHTML = expenses.slice().reverse().map(e =>
      "<div class='exprow'><div><b>" + esc(e.concepto) + "</b><br><span class='muted sm'>" + esc(e.fecha) + "</span></div>" +
      "<div class='expmonto'>" + fmt2(e.monto) + " <button class='btn xs danger' data-expdel='" + e.id + "'>✕</button></div></div>").join("");
    c.querySelectorAll("[data-expdel]").forEach(b => b.onclick = () => {
      expenses = expenses.filter(x => x.id !== b.dataset.expdel);
      window.Store.save(K.expenses, expenses); renderExpenses();
    });
    $("expTotalEl").textContent = fmt2(gastosTotal());
  }

  /* ---------- usuarios, login y admin ---------- */
  async function tryLogin() {
    const un = $("liUserInput").value.trim().toLowerCase();
    const pw = $("liPassInput").value;
    const btn = $("liGoBtn"); btn.classList.add("loading");
    if (window.Server && Server.online) {
      // captura el espacio local ANTES de sustituir la lista de usuarios
      const preUser = window.Auth.userByName(un);
      const preSpace = preUser ? Server.collectSpace(preUser.id) : {};
      try {
        const r = await Server.api({ action: "login", usuario: un, password: pw });
        if (r && r.ok) {
          Server.setToken(r.token); Server.setSrvUser(r.usuario);
          window.Store.saveRaw(window.Auth.K_USERS, r.usuarios || [r.usuario]);
          const srvDatos = r.datos || {};
          if (!Object.keys(srvDatos).length && Object.keys(preSpace).length) {
            // primera sincronización: los datos locales de esta persona suben al servidor
            Server.applySpace(r.usuario.id, preSpace);
            try { await Server.api({ action: "data_set", token: r.token, datos: preSpace }); } catch (e) {}
          } else {
            Server.applySpace(r.usuario.id, srvDatos);
          }
          window.Auth.setSession(r.usuario.id);
          location.reload();
          return;
        }
        btn.classList.remove("loading");
        toast((r && r.error) || "Usuario o contraseña incorrectos");
        return;
      } catch (e) { /* sin respuesta del servidor: acceso local */ }
    }
    const u = window.Auth.userByName(un);
    const ok = await window.Auth.verifyPassword(u, pw);
    btn.classList.remove("loading");
    if (ok) { window.Auth.setSession(u.id); location.reload(); }
    else toast("Usuario o contraseña incorrectos");
  }
  function renderGate() {
    const gate = $("gateEl");
    gate.hidden = false;
    document.querySelectorAll(".navbtn").forEach(b => { if (b.dataset.tab === "admin") b.hidden = true; });
    $("gateTitleEl").textContent = "Iniciar sesión";
    $("gateBodyEl").innerHTML =
      "<label class='lbl' for='liUserInput' style='text-align:left'>Usuario</label><div class='gfield'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><circle cx='12' cy='8' r='3.4'/><path d='M5 20a7 7 0 0 1 14 0'/></svg><input id='liUserInput' type='text' placeholder='Ej. admin' autocomplete='username'></div>" +
      "<label class='lbl' for='liPassInput' style='text-align:left'>Contraseña</label><div class='gfield'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><rect x='4' y='11' width='16' height='10' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/></svg><input id='liPassInput' type='password' placeholder='••••••••' autocomplete='current-password'></div>" +
      "<div class='btnrow' style='margin-top:14px'><button id='liGoBtn' class='btn' style='flex:1'>Entrar</button></div>";
    $("liGoBtn").onclick = tryLogin;
    $("liPassInput").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
    $("liUserInput").addEventListener("keydown", e => { if (e.key === "Enter") $("liPassInput").focus(); });
  }
  function enterApp(user) {
    $("gateEl").hidden = true;
    const chip = $("userChipEl");
    chip.innerHTML = "<span class='avatar sm' style='background:" + esc(user.color || "#0ea5e9") + "'>" + esc((user.name || "?")[0].toUpperCase()) + "</span><b>" + esc(user.name) + "</b>" + (user.role === "admin" ? "<small class='pill'>admin</small>" : "");
    document.querySelectorAll(".navbtn").forEach(b => { if (b.dataset.tab === "admin") b.hidden = user.role !== "admin"; });
    if (user.role === "admin") renderAdmin();
    renderVehicles(); renderFuel(); renderExpenses(); renderTasas(); renderTarifa(); renderHist();
    try { updateTasaBadge({ USD: window.Tasas.cachedUSD() }); } catch (e) {}
  }
  function renderAdmin() {
    const c = $("usersCtn"); if (!c) return;
    const users = window.Auth.users();
    c.innerHTML = users.map(u =>
      "<div class='carcard'><span class='avatar' style='background:" + esc(u.color || "#0ea5e9") + "'>" + esc((u.name || "?")[0].toUpperCase()) + "</span>" +
      "<div class='carinfo'><b>" + esc(u.name) + "</b><span class='muted sm'>@" + esc(u.username || "") + " · " + (u.role === "admin" ? "Administradora · acceso total" : "Chofer · sus carros y precios") + "</span></div>" +
      "<div class='carbtns'>" +
      "<button class='btn xs ghost' data-reset='" + u.id + "'>Clave</button>" +
      (u.role !== "admin" ? "<button class='btn xs danger' data-deluser='" + u.id + "'>✕</button>" : "") +
      "</div></div>").join("");
    c.querySelectorAll("[data-reset]").forEach(b => b.onclick = async () => {
      const np = prompt("Nueva contraseña (mínimo 4 caracteres):");
      if (np == null) return;
      try {
        if (window.Server && Server.online && Server.token()) {
          const r = await Server.api({ action: "user_update", token: Server.token(), id: b.dataset.reset, data: { password: np } });
          if (!r || !r.ok) throw new Error((r && r.error) || "error");
        } else await window.Auth.resetPassword(b.dataset.reset, np);
        toast("Contraseña actualizada");
      }
      catch (e) { toast(e.message && e.message.length > 12 ? e.message : "Mínimo 4 caracteres"); }
    });
    c.querySelectorAll("[data-deluser]").forEach(b => b.onclick = async () => {
      const u = window.Auth.users().find(x => x.id === b.dataset.deluser);
      if (!confirm("¿Eliminar a " + (u ? u.name : "") + " y todos sus datos?")) return;
      if (window.Server && Server.online && Server.token()) {
        const r = await Server.api({ action: "user_delete", token: Server.token(), id: b.dataset.deluser });
        if (!r || !r.ok) { toast((r && r.error) || "No se pudo eliminar"); return; }
        try { await window.Auth.deleteUser(b.dataset.deluser); } catch (e) {}
        const rl = await Server.api({ action: "users_list", token: Server.token() });
        if (rl && rl.ok) window.Store.saveRaw(window.Auth.K_USERS, rl.usuarios);
      } else await window.Auth.deleteUser(b.dataset.deluser);
      renderAdmin(); toast("Usuario eliminado");
    });
  }

  /* ---------- tema claro/oscuro + ripple ---------- */
  function applyTheme() {
    let t = "dark";
    try { t = localStorage.getItem("cubalog_theme") || "dark"; } catch (e) {}
    document.documentElement.dataset.theme = t;
    const b = $("themeBtn"); if (b) b.innerHTML = t === "dark" ? moonSvg() : sunSvg();
  }
  function sunSvg() { return "<svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/></svg>"; }
  function moonSvg() { return "<svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/></svg>"; }
  function initRipple() {
    document.addEventListener("pointerdown", e => {
      const b = e.target.closest && e.target.closest(".btn");
      if (!b) return;
      const r = b.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "ripple";
      const sz = Math.max(r.width, r.height);
      s.style.width = s.style.height = sz + "px";
      s.style.left = (e.clientX - r.left - sz / 2) + "px";
      s.style.top = (e.clientY - r.top - sz / 2) + "px";
      b.appendChild(s);
      setTimeout(() => s.remove(), 650);
    });
  }

  /* ---------- init ---------- */
  function init() {
    applyTheme(); initRipple();
    // tasa en caché desde el arranque para el doble precio
    try { lastUSD = window.Tasas.cachedUSD() || 0; } catch (e) {}
    // tabs
    document.querySelectorAll(".navbtn").forEach(b => b.onclick = () => goTab(b.dataset.tab));
    // geo origen + 1 destino inicial
    wireCascade($("oProvSel"), $("oMuniSel"), $("oLocSel"), $("oCustomInput"));
    addDestino(false);
    $("addDestBtn").onclick = () => { addDestino(true); };
    // vehículos
    renderVehicles();
    $("vehSel").onchange = e => { selectedVehicleId = e.target.value; window.Store.save("cubalog_selected_vehicle", selectedVehicleId); renderVehicles(); };
    $("vMarcaInput").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(buscarSugerencias, 350); });
    $("vModeloInput").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(buscarSugerencias, 350); });
    $("vehSearchBtn").onclick = buscarInternet;
    $("vehSaveBtn").onclick = () => {
      const marca = $("vMarcaInput").value.trim(), modelo = $("vModeloInput").value.trim();
      const chapa = $("vChapaInput").value.trim(), cons = Number($("vConsInput").value);
      const uni = $("vUnidadSel").value, comb = $("vCombSel").value, img = $("vImgInput").value.trim();
      if (!marca || !modelo) { toast("Marca y modelo son obligatorios"); return; }
      if (!isFinite(cons) || cons <= 0) { toast("Consumo inválido"); return; }
      const ed = $("vehSaveBtn").dataset.editing;
      if (ed) {
        const v = vehicles.find(x => x.id === ed);
        Object.assign(v, { marca, modelo, chapa, consumoValor: cons, consumoUnidad: uni, combustible: comb, imagen: img });
        toast("Vehículo actualizado");
      } else {
        const v = { id: uid(), marca, modelo, chapa, consumoValor: cons, consumoUnidad: uni, combustible: comb, imagen: img };
        vehicles.push(v); selectedVehicleId = v.id;
        toast("Carro guardado en Mis Carros");
      }
      window.Store.save(K.vehicles, vehicles);
      window.Store.save("cubalog_selected_vehicle", selectedVehicleId);
      clearVehForm(); renderVehicles();
    };
    $("vehCancelBtn").onclick = clearVehForm;
    // ajustes
    renderFuel(); renderExpenses(); renderTasas(); renderTarifa(); renderHist();
    $("fuelAutoBtn").onclick = fetchFuelOnline;
    $("tasaRefreshBtn").onclick = e => refreshTasas(e.target);
    $("infCheckBtn").onclick = e => revisarInformal(e.target);
    $("saveAjustesBtn").onclick = saveAjustes;
    const gk = window.Store.load(K.gkey, ""); if (gk) loadGoogle(gk);
    // gastos
    $("expAddBtn").onclick = () => {
      const c = $("expConceptoInput").value.trim() || "Gasto operativo";
      const m = Number($("expMontoInput").value);
      if (!isFinite(m) || m <= 0) { toast("Monto inválido"); return; }
      expenses.push({ id: uid(), concepto: c, monto: Math.round(m * 100) / 100, fecha: new Date().toLocaleString("es-CU") });
      window.Store.save(K.expenses, expenses);
      $("expConceptoInput").value = ""; $("expMontoInput").value = "";
      renderExpenses(); toast("Gasto registrado");
    };
    $("expClearBtn").onclick = () => { if (confirm("¿Borrar todos los gastos del día?")) { expenses = []; window.Store.save(K.expenses, expenses); renderExpenses(); } };
    // cálculo
    $("calcBtn").onclick = () => calcular(false);
    $("optBtn").onclick = () => calcular(true);
    $("histClearBtn").onclick = () => { if (confirm("¿Borrar el historial de cotizaciones?")) { window.Store.save(K_HIST, []); renderHist(); } };
    $("waBtn").onclick = () => {
      const t = "🧾 CubaLog — cotización:\n" + $("resCtn").innerText + "\n" + $("itinerarioEl").innerText + "\nhttps://perchance.org/" + (window.generatorName || "");
      window.open(waLink(t), "_blank");
    };
    $("shareBtn").onclick = () => {
      const t = $("resCtn").innerText || "CubaLog";
      const url = "https://perchance.org/" + (window.generatorName || "");
      const txt = "🧾 CubaLog — cotización:\n" + t + "\n" + $("itinerarioEl").innerText + "\n(" + url + ")";
      if (navigator.share) navigator.share({ title: "CubaLog", text: txt }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("Cotización copiada"));
    };
    initMap();
    // cabecera: tema, sesión
    $("themeBtn").onclick = () => {
      const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem("cubalog_theme", cur); } catch (e) {}
      applyTheme(); toast(cur === "light" ? "Modo claro" : "Modo oscuro");
    };
    $("logoutBtn").onclick = async () => { if (window.Server && Server.token()) { try { await Server.api({ action: "logout", token: Server.token() }); } catch (e) {} Server.setToken(""); Server.setSrvUser(null); } window.Auth.setSession(null); location.reload(); };
    // admin: crear usuario + respaldo
    const au = $("addUserBtn");
    if (au) au.onclick = async () => {
      au.classList.add("loading");
      try {
        if (window.Server && Server.online && Server.token()) {
          const r = await Server.api({ action: "user_create", token: Server.token(), data: { name: $("nuNameInput").value, username: $("nuUserInput").value, password: $("nuPassInput").value, role: "driver" } });
          if (!r || !r.ok) throw new Error((r && r.error) || "error");
          const rl = await Server.api({ action: "users_list", token: Server.token() });
          if (rl && rl.ok) window.Store.saveRaw(window.Auth.K_USERS, rl.usuarios);
        } else await window.Auth.createUser($("nuNameInput").value, $("nuUserInput").value, $("nuPassInput").value, "driver");
        $("nuNameInput").value = ""; $("nuUserInput").value = ""; $("nuPassInput").value = "";
        renderAdmin(); toast("Usuario creado: que inicie sesión");
      } catch (e) {
        toast(e.message === "clave" ? "Contraseña de mínimo 4 caracteres" : (e.message === "usuario" ? "Usuario: 3-20 letras/números" : (e.message === "duplicado" ? "Ese usuario ya existe" : (e.message && e.message.length > 12 ? e.message : "Escribe el nombre"))));
      }
      au.classList.remove("loading");
    };
    const ex = $("exportBtn");
    if (ex) ex.onclick = () => {
      const blob = new Blob([JSON.stringify(window.Auth.exportAll(), null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "cubalog-respaldo.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Respaldo descargado");
    };
    const im = $("importFile");
    if (im) im.onchange = async () => {
      const f = im.files[0]; if (!f) return;
      try {
        const n = window.Auth.importAll(JSON.parse(await f.text()));
        toast("Respaldo cargado (" + n + " datos)");
      } catch (e) { toast("Archivo inválido"); }
      im.value = "";
    };
    // puerta de acceso: migra cuentas viejas, siembra admin/chofer1 si es estreno
    (async function bootAuth() {
      if (window.Server) {
        Server.mounts();
        await Server.ping();
        Server.mounts(); Server.hookStore();
        if (Server.online) {
          const tok = Server.token(), su = Server.srvUser();
          if (tok && su) {
            try {
              const r = await Server.api({ action: "data_get", token: tok });
              if (r && r.ok) {
                if (su.role === "admin") {
                  const rl = await Server.api({ action: "users_list", token: tok });
                  if (rl && rl.ok) window.Store.saveRaw(window.Auth.K_USERS, rl.usuarios);
                }
                Server.applySpace(su.id, r.datos || {});
                window.Auth.setSession(su.id);
                enterApp(su); goTab("viaje"); return;
              }
            } catch (e) {}
            Server.setToken(""); Server.setSrvUser(null); window.Auth.setSession(null);
          }
          renderGate(); goTab("viaje"); return;
        }
      }
      try { await window.Auth.migrateLegacyIfNeeded(); } catch (e) {}
      if (!window.Auth.users().length) {
        try {
          const s = await window.Auth.seedDefaults();
          window.Auth.migrateGlobalsTo(s.admin.id);
        } catch (e) {}
      }
      const me = window.Auth.currentUid ? window.Auth.userById(window.Auth.currentUid) : null;
      if (!me) renderGate();
      else enterApp(me);
      goTab("viaje");
    })();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
