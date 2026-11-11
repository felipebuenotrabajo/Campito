// Pantalla de resumen: ingresos, gastos y mano de obra por cultivo, hectáreas, cosechas y cuentas.
import { cargarTodo, mensajeError } from './crud.js';
import { esc, eur, numf, MESES, sumar, redondea } from './util.js';

const CULTIVOS = ['Viñas', 'Olivos', 'Almendros', 'Barbechos']; // Cereales y el resto se agrupan en «Común y otros»
const COMUN = 'Común y otros';
const AYUDAS = 'Ayudas (PAC)';

export async function montarResumen(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora;
  cont.innerHTML = `<div class="cargando">Preparando el resumen…</div>`;

  const parcelas = await cargarTodo(x.sb, 'parcelas', [], 'id,ha_total,cultivo_id,explotacion_id,lote_id,activa');
  const movs = await cargarTodo(x.sb, 'movimientos_cuenta', [], 'cuenta_id,ingreso,cargo');

  async function pintar() {
    const rango = (q) => q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    let gastos, ingresos, diario, cosechas;
    try {
      [gastos, ingresos, diario, cosechas] = await Promise.all([
        cargarTodo(x.sb, 'gastos', [], 'fecha,destino,total,importe', rango),
        cargarTodo(x.sb, 'ingresos', [], 'fecha,producto,tipo,total,kilos', rango),
        cargarTodo(x.sb, 'diario_trabajo', [], 'fecha,tajo,horas,precio_jornal', rango),
        cargarTodo(x.sb, 'cosechas', [], 'fecha,cultivo,tipo,kilos_netos,kilos_limpios', rango),
      ]);
    } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }

    const hpj = x.ajustes.horas_por_jornal;
    const coste = (r) => (r.horas / hpj) * r.precio_jornal;
    const grupoTajo = (t) => (CULTIVOS.includes(t) ? t : COMUN);
    const grupoDestino = (d) => (CULTIVOS.includes(d) ? d : COMUN);
    const grupoIngreso = (r) => {
      if (CULTIVOS.includes(r.producto)) return r.producto;
      const t = (r.tipo || '').toLowerCase();
      if (/pac|sub/.test(`${r.producto || ''} ${t}`.toLowerCase())) return AYUDAS;
      if (t === 'blanca' || t === 'tinto' || t === 'tinta') return 'Viñas';
      if (t === 'almazara' || t === 'aderezo') return 'Olivos';
      if (t === 'almendras') return 'Almendros';
      return COMUN;
    };
    const filas = [...CULTIVOS, AYUDAS, COMUN];
    const tab = Object.fromEntries(filas.map((f) => [f, { mo: 0, gasto: 0, ingreso: 0 }]));
    for (const r of diario) tab[grupoTajo(r.tajo)].mo += coste(r);
    for (const r of gastos) (tab[grupoDestino(r.destino)] ?? tab[COMUN]).gasto += Number(r.total) || 0;
    for (const r of ingresos) (tab[grupoIngreso(r)] ?? tab[COMUN]).ingreso += Number(r.total) || 0;
    const T = { mo: sumar(Object.values(tab), 'mo'), gasto: sumar(Object.values(tab), 'gasto'), ingreso: sumar(Object.values(tab), 'ingreso') };
    const resultado = T.ingreso - T.gasto - T.mo;

    // por mes
    const mesMO = Array(12).fill(0), mesG = Array(12).fill(0), mesI = Array(12).fill(0);
    for (const r of diario) mesMO[+r.fecha.slice(5, 7) - 1] += coste(r);
    for (const r of gastos) mesG[+r.fecha.slice(5, 7) - 1] += Number(r.total) || 0;
    for (const r of ingresos) mesI[+r.fecha.slice(5, 7) - 1] += Number(r.total) || 0;

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
      <section class="kpis">
        <div class="kpi"><span>Ingresos</span><b>${eur(T.ingreso)}</b></div>
        <div class="kpi"><span>Gastos</span><b>${eur(T.gasto)}</b></div>
        <div class="kpi"><span>Mano de obra</span><b>${eur(T.mo)}</b></div>
        <div class="kpi ${clase(resultado)} destacado"><span>Resultado</span><b>${eur(resultado)}</b></div>
      </section>
      <section><h2>Resultado por cultivo <small>${anio} · importes en €</small></h2>
        ${tabla(['', 'Ingresos', 'Gastos', 'M. obra', 'Result.'], filas.map((f) => { const t = tab[f]; const r = t.ingreso - t.gasto - t.mo; return [esc(f), num0(t.ingreso), num0(t.gasto), num0(t.mo), `<b class="${clase(r)}">${num0(r)}</b>`]; }), ['Total', num0(T.ingreso), num0(T.gasto), num0(T.mo), `<b class="${clase(resultado)}">${num0(resultado)}</b>`])}
        <p class="nota">Los gastos «Todos», «Casa», «A cuenta» y «Her» aparecen en <i>${COMUN}</i>; el reparto por hectáreas entre socios llegará en la siguiente fase.</p>
      </section>
      <section><h2>Mes a mes <small>${anio}</small></h2>${grafico(mesI, mesG, mesMO)}</section>
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

function grafico(ing, gas, mo) {
  const max = Math.max(1, ...ing, ...gas, ...mo);
  const W = 640, H = 210, pb = 22, pt = 8, bw = 11, gap = (W - 24) / 12;
  const y = (v) => H - pb - (v / max) * (H - pb - pt);
  const serie = (arr, cls, off) => arr.map((v, i) => (v > 0 ? `<rect class="${cls}" x="${12 + i * gap + off}" y="${y(v)}" width="${bw}" height="${H - pb - y(v)}" rx="2"><title>${MESES[i]}: ${eur(v)}</title></rect>` : '')).join('');
  const meses = MESES.map((m, i) => `<text x="${12 + i * gap + bw * 1.5}" y="${H - 6}" text-anchor="middle">${m}</text>`).join('');
  return `<figure class="graf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos, gastos y mano de obra por mes"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" class="eje"/>${serie(ing, 'b-ing', 0)}${serie(gas, 'b-gas', bw + 1)}${serie(mo, 'b-mo', (bw + 1) * 2)}${meses}</svg>
  <figcaption><span class="lg l-ing"></span>Ingresos <span class="lg l-gas"></span>Gastos <span class="lg l-mo"></span>Mano de obra</figcaption></figure>`;
}
