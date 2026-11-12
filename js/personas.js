// Pantalla «Por persona»: índices de reparto y gastos que corresponden a cada socio (como en las hojas del Excel).
import { cargarTodo, mensajeError } from './crud.js';
import { esc, numf, eur0 } from './util.js';
import { PERSONAS, calcularIndices, repartirGastos } from './reparto.js';

const ORDEN_DESTINOS = ['Olivos', 'Viñas', 'Almendros', 'Barbechos', 'Cereales', 'Todos', 'Her', 'Casa', 'A cuenta'];
const ETIQUETA = { Todos: 'Generales (todos)', Her: 'Hermanos (a partes iguales)', Casa: 'Casa', 'A cuenta': 'A cuenta' };

export async function montarPersonas(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora;
  cont.innerHTML = '<div class="cargando">Calculando el reparto…</div>';
  let parcelas;
  try { parcelas = await cargarTodo(x.sb, 'parcelas', [], 'ha_total,cultivo_id,explotacion_id,activa'); }
  catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
  const indices = calcularIndices(parcelas.filter((p) => p.activa !== false).map((p) => ({
    ha: p.ha_total, cultivo: x.nombre('cultivos', p.cultivo_id), explotacion: x.nombre('entidades', p.explotacion_id),
  })));

  async function pintar() {
    let gastos;
    try {
      gastos = await cargarTodo(x.sb, 'gastos', [], 'total,destino,empresa_real_id,es_personal',
        (q) => q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`));
    } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
    const R = repartirGastos(gastos.map((g) => ({ total: g.total, destino: g.destino, empresa: x.nombre('entidades', g.empresa_real_id), personal: g.es_personal })), indices);
    const filas = ORDEN_DESTINOS.filter((d) => PERSONAS.some((p) => R.m[p]?.[d]));
    const tot = (p) => filas.reduce((s, d) => s + (R.m[p]?.[d] || 0), 0);
    const totFila = (d) => PERSONAS.reduce((s, p) => s + (R.m[p]?.[d] || 0), 0);
    const total = PERSONAS.reduce((s, p) => s + tot(p), 0);
    const sinTotal = R.sin.reduce((s, g) => s + g.total, 0);

    const tabla = (cab, cuerpo, pie) => `<div class="tabla-wrap"><table class="tabla"><thead><tr>${cab.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${cuerpo.map((f) => `<tr>${f.map((v, i) => `<td class="${i ? 'n' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${pie ? `<tfoot><tr>${pie.map((v, i) => `<td class="${i ? 'n' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
    const pct = (v) => (v ? `${numf(v * 100, 1)} %` : '–');
    const cultivosIdx = ['Olivos', 'Viñas', 'Almendros', 'Barbechos', 'Cereales', 'Todos'].filter((k) => indices.tot[k]);
    const cols = PERSONAS.filter((p) => cultivosIdx.some((k) => indices.idx[k][p]) || tot(p));

    cont.innerHTML = `
      <header class="cab"><h1>Por persona</h1>
        <select id="anio" aria-label="Año">${[ahora, ahora - 1, ahora - 2].map((a) => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select></header>
      <section><h2>Gastos que corresponden a cada persona <small>${anio} · en €</small></h2>
        ${filas.length ? tabla(['', ...cols, 'Total'],
          filas.map((d) => [esc(ETIQUETA[d] || d), ...cols.map((p) => (R.m[p]?.[d] ? eur0(R.m[p][d]) : '–')), `<b>${eur0(totFila(d))}</b>`]),
          ['Total', ...cols.map((p) => `<b>${eur0(tot(p))}</b>`), `<b>${eur0(total)}</b>`]) : '<p class="vacio">Sin gastos este año.</p>'}
        <p class="nota">Los gastos de Hermanos Bueno, Agrobueno y FBF (comunes) se reparten por hectáreas de cada explotación en el cultivo al que van; los «Hermanos» a partes iguales entre Antonio, Pepe, Cati y Felipe; los personales van enteros a su persona.</p>
        ${R.sin.length ? `<p class="aviso">${R.sin.length} gastos (${eur0(sinTotal)}) no se han podido repartir: ${esc([...new Set(R.sin.map((g) => g.motivo))].join('; '))}.</p>` : ''}
      </section>
      <section><h2>Índices de reparto <small>hectáreas de cada explotación sobre el total del cultivo</small></h2>
        ${tabla(['Cultivo', ...cols.map((p) => `${p} (ha)`), 'Total ha'],
          cultivosIdx.map((k) => [esc(k === 'Todos' ? 'Todas' : k), ...cols.map((p) => `${numf(indices.ha[k]?.[p] || 0, 2)} <small>${pct(indices.idx[k][p])}</small>`), `<b>${numf(indices.tot[k], 2)}</b>`]))}
      </section>`;
    cont.querySelector('#anio').addEventListener('change', (e) => { anio = +e.target.value; pintar(); });
  }
  await pintar();
}
