// Pantalla «Por persona»: índices de reparto y gastos que corresponden a cada socio (como en las hojas del Excel).
import { cargarTodo, mensajeError } from './crud.js';
import { esc, numf, eur0 } from './util.js';
import { PERSONAS, FILAS_RESULTADO, cuentasEntreSocios, calcularIndices, repartirGastos, repartirIngresos, repartirManoObra, resultadoPorPersona } from './reparto.js';

const ORDEN_DESTINOS = ['Olivos', 'Viñas', 'Almendros', 'Barbechos', 'Cereales', 'Todos', 'Her', 'Casa', 'A cuenta'];
const ETIQUETA = { Todos: 'Generales (todos)', Her: 'Hermanos (a partes iguales)', Casa: 'Casa', 'A cuenta': 'A cuenta' };

export async function montarPersonas(cont, x) {
  const ahora = new Date().getFullYear();
  let anio = ahora;
  let persona = null;
  cont.innerHTML = '<div class="cargando">Calculando el reparto…</div>';
  let parcelas, fincas;
  try {
    [parcelas, fincas] = await Promise.all([cargarTodo(x.sb, 'parcelas', [], 'ha_total,cultivo_id,explotacion_id,activa'), cargarTodo(x.sb, 'fincas', [], 'id,explotacion_id')]);
  }
  catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
  const indices = calcularIndices(parcelas.filter((p) => p.activa !== false).map((p) => ({
    ha: p.ha_total, cultivo: x.nombre('cultivos', p.cultivo_id), explotacion: x.nombre('entidades', p.explotacion_id),
  })));

  async function pintar() {
    let gastos, ingresos, diario;
    const rango = (q) => q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    try {
      [gastos, ingresos, diario] = await Promise.all([
        cargarTodo(x.sb, 'gastos', [], 'total,destino,empresa_real_id,es_personal,pagado_por_id', rango),
        cargarTodo(x.sb, 'ingresos', [], 'total,producto,tipo,agricultor_id', rango),
        cargarTodo(x.sb, 'diario_trabajo', [], 'tajo,horas,precio_jornal,finca_id,pagado_por_id', rango),
      ]);
    } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }
    const R = repartirGastos(gastos.map((g) => ({ total: g.total, destino: g.destino, empresa: x.nombre('entidades', g.empresa_real_id), personal: g.es_personal })), indices);
    const ingRep = repartirIngresos(ingresos.map((i) => ({ total: i.total, producto: i.producto, tipo: i.tipo, agricultor: x.nombre('entidades', i.agricultor_id) })));
    const explotacionDe = Object.fromEntries(fincas.map((f) => [f.id, x.nombre('entidades', f.explotacion_id)]));
    const hpj = x.ajustes.horas_por_jornal;
    const mo = repartirManoObra(diario.map((d) => ({ tajo: d.tajo, coste: (d.horas / hpj) * d.precio_jornal, explotacion: d.finca_id ? explotacionDe[d.finca_id] : null, pagadoPor: x.nombre('entidades', d.pagado_por_id) })), indices);
    const RES = resultadoPorPersona(R, ingRep, mo);
    const tp = (p, k) => Object.values(RES[p] || {}).reduce((a, c) => a + c[k], 0);
    const quienes = PERSONAS.filter((p) => tp(p, 'ingresos') || tp(p, 'gastos') || tp(p, 'mo'));
    if (!persona || !quienes.includes(persona)) persona = quienes.includes('FBF') ? 'FBF' : quienes[0];
    const CU = cuentasEntreSocios(gastos.map((g) => ({ total: g.total, pagador: x.nombre('entidades', g.pagado_por_id) })),
      diario.map((d) => ({ coste: (d.horas / hpj) * d.precio_jornal, pagador: x.nombre('entidades', d.pagado_por_id) })),
      Object.fromEntries(PERSONAS.map((p) => [p, tp(p, 'gastos') + tp(p, 'mo')])));
    const sinPag = CU.sinPagador.gastos + CU.sinPagador.mo;
    const clase = (n) => (n < 0 ? 'neg' : 'pos');
    const resu = (c) => c.ingresos - c.gastos - c.mo;
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
      <section><h2>Resultado por persona <small>${anio} · ingresos − gastos − mano de obra</small></h2>
        ${tabla(['', 'Ingresos', 'Gastos', 'M. obra', 'Resultado'], quienes.map((p) => [esc(p), eur0(tp(p, 'ingresos')), eur0(tp(p, 'gastos')), eur0(tp(p, 'mo')), `<b class="${clase(tp(p, 'ingresos') - tp(p, 'gastos') - tp(p, 'mo'))}">${eur0(tp(p, 'ingresos') - tp(p, 'gastos') - tp(p, 'mo'))}</b>`]),
          ['Total', ...['ingresos', 'gastos', 'mo'].map((k) => `<b>${eur0(quienes.reduce((a, p) => a + tp(p, k), 0))}</b>`), `<b>${eur0(quienes.reduce((a, p) => a + tp(p, 'ingresos') - tp(p, 'gastos') - tp(p, 'mo'), 0))}</b>`])}
        <p class="nota">La mano de obra de cada jornada va a la explotación de su finca; la que no tiene finca, a quien la pagó o, si no, por hectáreas. Los ingresos van al agricultor real de cada factura.</p>
      </section>
      <section><h2>Cuentas entre socios <small>${anio} · lo pagado frente a lo que corresponde</small></h2>
        ${tabla(['Cuenta', 'Pagó gastos', 'Pagó M. obra', 'Total pagado', 'Le corresponde', 'Saldo'], CU.filas.map((f) => [esc(f.cuenta), eur0(f.gastos), eur0(f.mo), eur0(f.pagado), eur0(f.corresponde), `<b class="${clase(f.saldo)}">${eur0(f.saldo)}</b>`]),
          ['Total', ...['gastos', 'mo', 'pagado', 'corresponde'].map((k) => `<b>${eur0(CU.filas.reduce((a, f) => a + f[k], 0))}</b>`), `<b>${eur0(CU.filas.reduce((a, f) => a + f.saldo, 0))}</b>`])}
        <p class="nota">Saldo positivo: ha pagado más de lo que le corresponde (los demás le deben). Negativo: debe a los demás. Hermanos Bueno SC se suma a Cati, Agrobueno SC a Felipe, y Pepe a FBF, como en el Excel.${sinPag ? ` Hay ${eur0(sinPag)} de gastos y mano de obra sin pagador indicado, que no se suman a ninguna cuenta.` : ''} No incluye los ingresos cobrados.</p>
      </section>
      <section><h2>Detalle de <select id="quien" aria-label="Persona">${quienes.map((p) => `<option ${p === persona ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select> <small>${anio}</small></h2>
        ${tabla(['', 'Ingresos', 'Gastos', 'M. obra', 'Resultado'], FILAS_RESULTADO.filter((g) => RES[persona]?.[g]).map((g) => { const c = RES[persona][g]; return [esc(g), eur0(c.ingresos), eur0(c.gastos), eur0(c.mo), `<b class="${clase(resu(c))}">${eur0(resu(c))}</b>`]; }),
          ['Total', ...['ingresos', 'gastos', 'mo'].map((k) => `<b>${eur0(tp(persona, k))}</b>`), `<b class="${clase(tp(persona, 'ingresos') - tp(persona, 'gastos') - tp(persona, 'mo'))}">${eur0(tp(persona, 'ingresos') - tp(persona, 'gastos') - tp(persona, 'mo'))}</b>`])}
      </section>
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
    cont.querySelector('#quien')?.addEventListener('change', (e) => { persona = e.target.value; pintar(); });
    cont.querySelector('#anio').addEventListener('change', (e) => { anio = +e.target.value; pintar(); });
  }
  await pintar();
}
