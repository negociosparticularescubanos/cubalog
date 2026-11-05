/* CubaLog — calculator.js: matemática del negocio.
   precioFinal = (combustible + recargo + gastosDiarios) con 10% chofer incluido.
   Interpretación: el chofer se lleva el 10% del precio cobrado al cliente.
   Por tanto: precioCliente = subtotal / (1 - pctChofer). choferGana = precioCliente * pct.
   Expone: window.Calc = { calcular } */

(function () {
  function calcular(o) {
    // o: { km, consumoLkm, precioL, tipoViaje, pctRecargo, gastosDiarios, pctChofer }
    const km = Math.max(0, Number(o.km) || 0);
    const consumoLkm = Math.max(0, Number(o.consumoLkm) || 0);
    const precioL = Math.max(0, Number(o.precioL) || 0);
    const pctRec = Math.max(0, Number(o.pctRecargo) || 0);
    const gastos = Math.max(0, Number(o.gastosDiarios) || 0);
    let pctCh = Number(o.pctChofer);
    if (!isFinite(pctCh) || pctCh < 0) pctCh = 10;
    if (pctCh >= 50) pctCh = 10; // seguridad: evita división por cero

    const litros = km * consumoLkm;
    const costoComb = litros * precioL;
    const recargo = costoComb * (pctRec / 100);
    const subtotal = costoComb + recargo + gastos;
    const precioFinal = subtotal / (1 - pctCh / 100);
    const chofer = precioFinal * (pctCh / 100);
    const costoReal = subtotal; // lo que sale de tu bolsillo
    const utilidadSobreCostos = precioFinal - subtotal; // == chofer

    const r2 = x => Math.round(x * 100) / 100;
    return {
      km: r2(km), litros: r2(litros), costoComb: r2(costoComb),
      pctRecargo: pctRec, recargo: r2(recargo),
      gastosDiarios: r2(gastos), subtotal: r2(subtotal),
      pctChofer: pctCh, chofer: r2(chofer),
      precioFinal: r2(precioFinal), costoReal: r2(costoReal),
      utilidad: r2(utilidadSobreCostos)
    };
  }
  // Modelo tarifario estilo app (La Nave / Yango): banderazo + por km + por min,
  // mínimo, retorno vacío (ida y vuelta) y recargo nocturno. Todo configurable.
  function tarifa(o) {
    var km = Math.max(0, Number(o.km) || 0);
    var min = Math.max(0, Number(o.min) || 0);
    var band = Math.max(0, Number(o.banderazo) || 0);
    var pKm = Math.max(0, Number(o.porKm) || 0);
    var pMin = Math.max(0, Number(o.porMin) || 0);
    var mini = Math.max(0, Number(o.minimo) || 0);
    var mult = Number(o.multNocturno); if (!isFinite(mult) || mult < 1) mult = 1;
    var fRet = Number(o.factorRetorno); if (!isFinite(fRet) || fRet < 0) fRet = 0.5;
    var kmF = km * (o.idaVuelta ? (1 + fRet) : 1);
    var mKm = kmF * pKm, mMin = min * pMin;
    var sub = band + mKm + mMin;
    var base = Math.max(sub, mini);
    var total = base * (o.esNocturno ? mult : 1);
    var pax = Math.max(1, Math.round(Number(o.pasajeros) || 1));
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return { kmFacturados: r2(kmF), banderazo: r2(band), mKm: r2(mKm), mMin: r2(mMin), minimo: r2(mini), subtotal: r2(sub), total: r2(total), porPersona: r2(total / pax), pasajeros: pax, esNocturno: !!o.esNocturno, mult: mult };
  }
  window.Calc = { calcular, tarifa };
})();
