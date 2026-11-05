/* CubaLog — Catálogo de vehículos frecuentes en Cuba (para autocompletado).
   Cada entrada: marca, modelo, consumoL100 (L/100km), combustible, nota, color para avatar.
   Expone: window.VEHICLE_CATALOG (array) + window.findVehicle(marca, modelo) */

(function () {
  const C = [
    { marca: "Lada", modelo: "2107", consumoL100: 9.5, combustible: "Gasolina Regular", nota: "Clásico de Cuba, carburación", color: "#e11d48" },
    { marca: "Lada", modelo: "Niva 2121 4x4", consumoL100: 11.0, combustible: "Gasolina Regular", nota: "4x4, ideal campo", color: "#16a34a" },
    { marca: "Lada", modelo: "Vesta", consumoL100: 7.8, combustible: "Gasolina Especial", nota: "Moderno, inyección", color: "#2563eb" },
    { marca: "Moskvich", modelo: "2140", consumoL100: 10.0, combustible: "Gasolina Regular", nota: "Moscovita clásico", color: "#b45309" },
    { marca: "Volga", modelo: "GAZ-24", consumoL100: 12.5, combustible: "Gasolina Regular", nota: "Grande, 6 plazas", color: "#475569" },
    { marca: "Hyundai", modelo: "Accent", consumoL100: 6.8, combustible: "Gasolina Especial", nota: "Muy común en renta/taxi", color: "#0ea5e9" },
    { marca: "Hyundai", modelo: "Santa Fe", consumoL100: 9.2, combustible: "Diesel", nota: "SUV 7 plazas", color: "#0284c7" },
    { marca: "Hyundai", modelo: "Grand i10", consumoL100: 6.2, combustible: "Gasolina Especial", nota: "Económico ciudad", color: "#06b6d4" },
    { marca: "Kia", modelo: "Picanto", consumoL100: 5.9, combustible: "Gasolina Especial", nota: "Muy económico", color: "#8b5cf6" },
    { marca: "Kia", modelo: "Rio", consumoL100: 6.9, combustible: "Gasolina Especial", nota: "Sedán rendidor", color: "#7c3aed" },
    { marca: "Peugeot", modelo: "206", consumoL100: 6.5, combustible: "Gasolina Especial", nota: "Compacto francés", color: "#dc2626" },
    { marca: "Peugeot", modelo: "301", consumoL100: 6.4, combustible: "Diesel", nota: "Versión diésel muy usada", color: "#991b1b" },
    { marca: "Peugeot", modelo: "Partner (carga)", consumoL100: 7.5, combustible: "Diesel", nota: "Furgoneta de carga", color: "#f59e0b" },
    { marca: "Toyota", modelo: "Corolla", consumoL100: 7.0, combustible: "Gasolina Especial", nota: "Fiable, taxi interprovincial", color: "#ef4444" },
    { marca: "Toyota", modelo: "Hilux 4x4", consumoL100: 9.8, combustible: "Diesel", nota: "Pickup carga + pasajeros", color: "#166534" },
    { marca: "Volkswagen", modelo: "Polo", consumoL100: 6.6, combustible: "Gasolina Especial", nota: "Sedán europeo", color: "#1d4ed8" },
    { marca: "Geely", modelo: "CK", consumoL100: 7.2, combustible: "Gasolina Especial", nota: "Chino, flota estatal", color: "#0891b2" },
    { marca: "Chevrolet", modelo: "Spark", consumoL100: 6.0, combustible: "Gasolina Especial", nota: "Pequeño y económico", color: "#fbbf24" },
    { marca: "Mercedes-Benz", modelo: "Sprinter (carga/pasaj.)", consumoL100: 10.5, combustible: "Diesel", nota: "Furgón 15+ plazas o carga", color: "#334155" },
    { marca: "Kamaz", modelo: "Camión 5320", consumoL100: 28.0, combustible: "Diesel", nota: "Camión pesado", color: "#78350f" },
    { marca: "Suzuki", modelo: "Swift", consumoL100: 5.8, combustible: "Gasolina Especial", nota: "Muy económico", color: "#ec4899" },
    { marca: "Nissan", modelo: "Tiida", consumoL100: 7.4, combustible: "Gasolina Especial", nota: "Sedán amplio", color: "#64748b" }
  ];

  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

  function score(entry, qMarca, qModelo) {
    let s = 0;
    const m = norm(entry.marca), mo = norm(entry.modelo);
    if (!qMarca && !qModelo) return 0;
    if (qMarca) {
      if (m === qMarca) s += 10;
      else if (m.startsWith(qMarca)) s += 6;
      else if (m.includes(qMarca)) s += 3;
    }
    if (qModelo) {
      const qTokens = qModelo.split(/\s+/);
      for (const t of qTokens) { if (t && mo.includes(t)) s += 4; }
      if (mo === qModelo) s += 8;
    }
    return s;
  }

  function findVehicle(marca, modelo, n) {
    n = n || 5;
    const qm = norm(marca), qo = norm(modelo);
    if (!qm && !qo) return [];
    return C.map(e => ({ e, s: score(e, qm, qo) }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.e);
  }

  window.VEHICLE_CATALOG = C;
  window.findVehicle = findVehicle;
})();
