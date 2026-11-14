// Pantalla de resumen: cosechas, saldos de cuentas y hectáreas. Los resultados económicos están en «Por persona».
import { cargarTodo, mensajeError } from './crud.js';
import { esc, eur, numf, sumar, redondea } from './util.js';

export async function montarResumen(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora;
  cont.innerHTML = `<div class="cargando">Preparando el resumen…</div>`;

  const parcelas = await cargarTodo(x.sb, 'parcelas', [], 'id,ha_total,cultivo_id,explotacion_id,lote_id,activa');
  const movs = await cargarTodo(x.sb, 'movimientos_cuenta', [], 'cuenta_id,ingreso,cargo');

  async function pintar() {
    const rango = (q) => q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    let cosechas;
    try {
      cosechas = await cargarTodo(x.sb, 'cosechas', [], 'fecha,cultivo,tipo,kilos_netos,kilos_limpios', rango);
    } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }

    // hectáreas
    const activas = parcelas.filter((p) => p.activa !== false);
    const pivot = (campo) => {
      const ids = [...new Set(activas.map((p) => p[campo]).filter(Boolean))].sort((a, b) => (x.cat.entidades.find((e) => e.id === a)?.orden ?? 99) - (x.cat.entidades.find((e) => e.id === b)?.orden ?? 99));
      const filasC = x.cat.cultivos.map((cu) => ({ n: cu.nombre, v: ids.map((id) => sumar(activas.filter((p) => p.cultivo_id === cu.id && p[campo] === id), 'ha_total')) })).filter((f) => f.v.some(Boolean));
      return { cols: ids.map((id) => x.nombre('entidades', id)), filas: filasC };
    };

    // cosechas
    const porTipo = {};
    for (const r of cosechas) { const k = r.tipo || r.cultivo; const o = (porTipo[k] ??= { n: 0, netos: 0, limpios: 0 }); o.n++; o.netos += Number(r.kilos_netos) || 0; o.limpios += Number(r.kilos_limpios) || 0; }

    // saldos
    const saldos = x.cat.cuentas.map((c) => ({ n: c.nombre, s: redondea(movs.filter((m) => m.cuenta_id === c.id).reduce((s, m) => s + (Number(m.ingreso) || 0) - (Number(m.cargo) || 0), 0)) }));

    const tabla = (cab, cuerpo, pie) => `<div class="tabla-wrap"><table class="tabla"><thead><tr>${cab.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${cuerpo.map((f) => `<tr>${f.map((v, i) => `<td class="${i ? 'n' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${pie ? `<tfoot><tr>${pie.map((v, i) => `<td class="${i ? 'n' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
    const num0 = (n) => numf(n, 0);
    const clase = (n) => (n < 0 ? 'neg' : 'pos');
    const hl = pivot('explotacion_id'), lo = pivot('lote_id');
    const tabHa = (p) => tabla(['Cultivo', ...p.cols, 'Total'], p.filas.map((f) => [esc(f.n), ...f.v.map((v) => (v ? numf(v, 2) : '–')), `<b>${numf(sumar(f.v.map((v) => ({ v })), 'v'), 2)}</b>`]), ['Total', ...p.cols.map((_, i) => numf(sumar(p.filas.map((f) => ({ v: f.v[i] })), 'v'), 2)), `<b>${numf(sumar(p.filas.flatMap((f) => f.v.map((v) => ({ v }))), 'v'), 2)}</b>`]);

    cont.innerHTML = `
      <header class="cab"><h1>Resumen</h1>
        <select id="anio" aria-label="Año">${[ahora, ahora - 1, ahora - 2, ahora - 3].map((a) => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select></header>
      <div class="dos">
        <section><h2>Cosecha entregada <small>${anio}</small></h2>${Object.keys(porTipo).length ? tabla(['Tipo', 'Entregas', 'Kg netos', 'Kg limpios'], Object.entries(porTipo).sort((a, b) => b[1].netos - a[1].netos).map(([k, o]) => [esc(k), o.n, numf(o.netos, 0), numf(o.limpios, 0)]), ['Total', sumar(Object.values(porTipo), 'n'), numf(sumar(Object.values(porTipo), 'netos'), 0), numf(sumar(Object.values(porTipo), 'limpios'), 0)]) : '<p class="vacio">Sin entregas este año.</p>'}</section>
        <section><h2>Saldo de cuentas</h2>${tabla(['Cuenta', 'Saldo'], saldos.map((s) => [esc(s.n), `<span class="${clase(s.s)}">${eur(s.s)}</span>`]), ['Total', eur(sumar(saldos, 's'))])}</section>
      </div>
      <section><h2>Hectáreas por explotación</h2>${tabHa(hl)}</section>
      <section><h2>Hectáreas por lote</h2>${tabHa(lo)}</section>`;
    cont.querySelector('#anio').addEventListener('change', (e) => { anio = +e.target.value; pintar(); });
  }
  await pintar();
}
