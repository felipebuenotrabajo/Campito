// Informes de producción por finca (Olivos, Viñas, Almendros, Cereales) y jornales por semana.
import { cargarTodo, mensajeError } from './crud.js';
import { esc, numf, eur0, MESES } from './util.js';

const GRUPOS = ['Olivos', 'Viñas', 'Almendros', 'Cereales'];
const tabla = (cab, cuerpo, pie) => `<div class="tabla-wrap"><table class="tabla"><thead><tr>${cab.map((h, i) => `<th class="${i > 0 ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${cuerpo.map((f) => `<tr>${f.map((v, i) => `<td class="${i > 0 ? 'n' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>${pie ? `<tfoot><tr>${pie.map((v, i) => `<td class="${i > 0 ? 'n' : ''}">${v}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
const selAnio = (anio, ahora) => `<select id="anio" aria-label="Año">${[ahora, ahora - 1, ahora - 2, ahora - 3].map((a) => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
const rangoAnio = (anio) => (q) => q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);

// ---------------------------------------------------------------- Producción por finca
export async function montarProduccion(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora;
  cont.innerHTML = '<div class="cargando">Preparando el informe…</div>';
  let fincas, parcelas;
  try {
    [fincas, parcelas] = await Promise.all([cargarTodo(x.sb, 'fincas', [], 'id,nombre,cultivo_id,explotacion_id,activa'), cargarTodo(x.sb, 'parcelas', [], 'finca_id,ha_total,activa')]);
  } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
  const haDe = {};
  for (const p of parcelas) if (p.activa !== false && p.finca_id) haDe[p.finca_id] = (haDe[p.finca_id] || 0) + (Number(p.ha_total) || 0);
  const grupoDe = (f) => { const c = x.cat.cultivos.find((k) => k.id === f.cultivo_id); const g = c?.grupo || c?.nombre; return g === 'Barbechos' ? null : g; };

  async function pintar() {
    let cosechas, diario;
    try {
      [cosechas, diario] = await Promise.all([
        cargarTodo(x.sb, 'cosechas', [], 'finca_id,kilos_netos,kilos_limpios', rangoAnio(anio)),
        cargarTodo(x.sb, 'diario_trabajo', [], 'finca_id,horas,precio_jornal', rangoAnio(anio)),
      ]);
    } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
    const hpj = x.ajustes.horas_por_jornal;
    const kg = {}, kgL = {}, jor = {}, eu = {};
    for (const c of cosechas) { kg[c.finca_id] = (kg[c.finca_id] || 0) + (Number(c.kilos_netos) || 0); kgL[c.finca_id] = (kgL[c.finca_id] || 0) + (Number(c.kilos_limpios) || 0); }
    let sinFinca = 0;
    for (const d of diario) {
      const j = d.horas / hpj;
      if (!d.finca_id) { sinFinca += j; continue; }
      jor[d.finca_id] = (jor[d.finca_id] || 0) + j; eu[d.finca_id] = (eu[d.finca_id] || 0) + j * d.precio_jornal;
    }
    const secciones = GRUPOS.map((g) => {
      const fs = fincas.filter((f) => grupoDe(f) === g && (haDe[f.id] || kg[f.id] || jor[f.id])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      if (!fs.length) return `<section><h2>${g} <small>${anio}</small></h2><p class="vacio">Sin fincas ni datos de ${g.toLowerCase()} este año.</p></section>`;
      const S = (k) => fs.reduce((a, f) => a + (k[f.id] || 0), 0);
      const ha = fs.reduce((a, f) => a + (haDe[f.id] || 0), 0);
      const fila = (nombre, sub, h, k, j, e) => [`${esc(nombre)}${sub ? `<br><small>${esc(sub)}</small>` : ''}`, h ? numf(h, 2) : '–', k ? numf(k, 0) : '–', k && h ? numf(k / h, 0) : '–', j ? numf(j, 1) : '–', e ? eur0(e) : '–', k && e ? numf(e / k, 3) : '–'];
      return `<section><h2>${g} <small>${anio}</small></h2>${tabla(['Finca', 'Ha', 'Kg netos', 'Kg/ha', 'Jornales', 'M. obra €', '€/kg'],
        fs.map((f) => fila(f.nombre, [x.cat.cultivos.find((c) => c.id === f.cultivo_id)?.nombre !== g ? x.cat.cultivos.find((c) => c.id === f.cultivo_id)?.nombre : '', x.nombre('entidades', f.explotacion_id)].filter(Boolean).join(' · '), haDe[f.id], kg[f.id], jor[f.id], eu[f.id])),
        ['Total', numf(ha, 2), numf(S(kg), 0), ha && S(kg) ? numf(S(kg) / ha, 0) : '–', numf(S(jor), 1), eur0(S(eu)), S(kg) && S(eu) ? numf(S(eu) / S(kg), 3) : '–'])}</section>`;
    });
    cont.innerHTML = `<header class="cab"><h1>Producción por finca</h1>${selAnio(anio, ahora)}</header>
      ${secciones.join('')}
      <p class="nota">Kg = kilos netos entregados. Jornales = horas ÷ ${hpj}. «€/kg» es el coste de mano de obra por kilo. ${sinFinca ? `Hay ${numf(sinFinca, 1)} jornales sin finca (día de orden, casa…) que no se incluyen aquí.` : ''}</p>`;
    cont.querySelector('#anio').addEventListener('change', (e) => { anio = +e.target.value; pintar(); });
  }
  await pintar();
}

// ---------------------------------------------------------------- Jornales por semana
const TAJOS = ['Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Otros'];
const aFecha = (s) => { const [a, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const inicioSemana = (s) => { const f = aFecha(s); f.setUTCDate(f.getUTCDate() - f.getUTCDay()); return f; }; // domingo, como en el Excel
const iso = (f) => f.toISOString().slice(0, 10);
const corta = (f) => `${String(f.getUTCDate()).padStart(2, '0')} ${MESES[f.getUTCMonth()]}`;

export async function montarSemanas(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora, quien = '';
  cont.innerHTML = '<div class="cargando">Preparando el informe…</div>';
  let fincas;
  try { fincas = await cargarTodo(x.sb, 'fincas', [], 'id,explotacion_id'); }
  catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
  const explotacionDe = Object.fromEntries(fincas.map((f) => [f.id, x.nombre('entidades', f.explotacion_id)]));
  const opciones = [...new Set(Object.values(explotacionDe).filter(Boolean))];

  async function pintar() {
    let diario;
    try { diario = await cargarTodo(x.sb, 'diario_trabajo', [], 'fecha,tajo,horas,precio_jornal,finca_id', rangoAnio(anio)); }
    catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
    const hpj = x.ajustes.horas_por_jornal;
    const semanas = new Map();
    for (const d of diario) {
      if (quien && explotacionDe[d.finca_id] !== quien) continue;
      const k = iso(inicioSemana(d.fecha));
      const s = semanas.get(k) ?? { j: Object.fromEntries(TAJOS.map((t) => [t, 0])), eu: 0 };
      const j = d.horas / hpj;
      s.j[TAJOS.includes(d.tajo) ? d.tajo : 'Otros'] += j; s.eu += j * d.precio_jornal;
      semanas.set(k, s);
    }
    const lista = [...semanas.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const totJ = (s) => TAJOS.reduce((a, t) => a + s.j[t], 0);
    const T = { j: Object.fromEntries(TAJOS.map((t) => [t, lista.reduce((a, [, s]) => a + s.j[t], 0)])), eu: lista.reduce((a, [, s]) => a + s.eu, 0) };
    const max = Math.max(1, ...lista.map(([, s]) => s.eu));
    const W = 640, H = 170, pb = 20, pt = 6, gap = (W - 16) / Math.max(lista.length, 1), bw = Math.max(3, Math.min(14, gap - 3));
    const barras = lista.map(([k, s], i) => { const h = (s.eu / max) * (H - pb - pt); return `<rect class="b-mo" x="${8 + i * gap}" y="${H - pb - h}" width="${bw}" height="${h}" rx="2"><title>Semana del ${corta(aFecha(k))}: ${eur0(s.eu)} · ${numf(totJ(s), 1)} jornales</title></rect>`; }).join('');
    const marcas = lista.map(([k], i) => (i % Math.ceil(lista.length / 12) === 0 ? `<text x="${8 + i * gap + bw / 2}" y="${H - 5}" text-anchor="middle">${corta(aFecha(k))}</text>` : '')).join('');
    cont.innerHTML = `<header class="cab"><h1>Jornales por semana</h1>
        <span class="filtros-cab"><select id="quien" aria-label="Explotación"><option value="">Todas las explotaciones</option>${opciones.map((o) => `<option ${o === quien ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${selAnio(anio, ahora)}</span></header>
      ${lista.length ? `<section><h2>Coste de mano de obra por semana <small>${anio}</small></h2><figure class="graf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Coste de mano de obra por semana"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" class="eje"/>${barras}${marcas}</svg></figure></section>
      <section><h2>Detalle <small>jornales por cultivo · semanas que empiezan en domingo</small></h2>${tabla(['Semana del', ...TAJOS, 'Jornales', 'Coste €'],
        lista.map(([k, s]) => [corta(aFecha(k)), ...TAJOS.map((t) => (s.j[t] ? numf(s.j[t], 1) : '–')), `<b>${numf(totJ(s), 1)}</b>`, eur0(s.eu)]),
        ['Total', ...TAJOS.map((t) => numf(T.j[t], 1)), `<b>${numf(TAJOS.reduce((a, t) => a + T.j[t], 0), 1)}</b>`, eur0(T.eu)])}
        <p class="nota">Jornales = horas ÷ ${hpj}. «Otros» incluye día de orden y casa. ${quien ? `Solo jornadas de fincas de la explotación de ${esc(quien)}.` : ''}</p></section>` : '<p class="vacio">Sin jornales este año.</p>'}`;
    cont.querySelector('#anio').addEventListener('change', (e) => { anio = +e.target.value; pintar(); });
    cont.querySelector('#quien').addEventListener('change', (e) => { quien = e.target.value; pintar(); });
  }
  await pintar();
}
