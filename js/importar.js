// Importa el Excel maestro a la base de datos, directamente desde el navegador.
// El archivo NO se sube a ningún sitio: se lee en tu dispositivo y solo se envían las filas limpias a Supabase.
import { analizar } from './parser.js';
import { esc, toast } from './util.js';
import { mensajeError } from './crud.js';

const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
// hoja -> [filas máx., columnas máx.]
const HOJAS = {
  'Parcelas': [75, 32], 'Diario de trabajo 2026': [960, 30], 'Gastos 2026': [1100, 20], 'Ingresos 2026': [400, 20],
  'Cosechas 2026': [260, 21], 'CUENTAS COOPE': [400, 35], 'INVENTARIO': [300, 9], 'Correspondencia 2026': [600, 8],
};
const ORDEN = ['fincas', 'parcelas', 'diario_trabajo', 'gastos', 'ingresos', 'cosechas', 'movimientos_cuenta', 'inventario', 'correspondencia'];
const NOMBRES = {
  fincas: 'Fincas', parcelas: 'Parcelas', diario_trabajo: 'Diario de trabajo', gastos: 'Gastos', ingresos: 'Ingresos', cosechas: 'Cosechas',
  movimientos_cuenta: 'Movimientos de cuentas', inventario: 'Inventario', correspondencia: 'Correspondencia',
};

function cargarScript(src) {
  return new Promise((ok, ko) => {
    if (window.XLSX) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el lector de Excel (¿sin internet?)'));
    document.head.append(s);
  });
}

export async function montarImportar(cont, x) {
  if (x.rol !== 'admin') { cont.innerHTML = '<div class="vacio">Solo los administradores pueden importar datos.</div>'; return; }
  cont.innerHTML = `
    <header class="cab"><h1>Importar Excel</h1></header>
    <section class="panel">
      <p>Carga aquí el Excel maestro (<i>EJERCICIO 2026</i>). Se leen las hojas <b>Parcelas, Diario, Gastos, Ingresos, Cosechas, Cuentas, Inventario y Correspondencia</b>;
      el resto son cálculos que la aplicación ya hace sola. <b>Todo lo relacionado con la granja y los cerdos se descarta.</b></p>
      <p class="nota">El archivo se lee en tu propio dispositivo; no se sube a ningún servidor ni a GitHub.</p>
      <label class="btn primario archivo">Elegir archivo .xlsx<input type="file" accept=".xlsx,.xlsm" hidden></label>
    </section>
    <div id="imp-resultado"></div>`;
  const res = cont.querySelector('#imp-resultado');
  cont.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    res.innerHTML = '<div class="cargando">Leyendo el Excel…</div>';
    try {
      await cargarScript(SHEETJS);
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const hojas = {};
      const faltan = [];
      for (const [n, [fr, fc]] of Object.entries(HOJAS)) {
        const ws = wb.Sheets[n];
        if (!ws) { faltan.push(n); continue; }
        hojas[n] = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range: { s: { r: 0, c: 0 }, e: { r: fr - 1, c: fc - 1 } } });
      }
      const analisis = analizar(hojas);
      await mostrar(analisis, faltan);
    } catch (err) { res.innerHTML = `<div class="vacio">${esc(mensajeError(err))}</div>`; }
  });

  async function mostrar(a, faltan) {
    const existentes = {};
    for (const t of ORDEN) {
      const { count } = await x.sb.from(t).select('*', { count: 'exact', head: true });
      existentes[t] = count ?? 0;
    }
    res.innerHTML = `
      ${faltan.length ? `<div class="aviso">No se encontraron estas hojas: ${faltan.map(esc).join(', ')}</div>` : ''}
      <section class="panel"><h2>Qué se va a importar</h2>
        <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Datos</th><th class="n">Filas a importar</th><th class="n">Descartadas (ganadería)</th><th class="n">Ya en la base</th><th>Acción</th></tr></thead><tbody>
        ${ORDEN.map((t) => `<tr><td>${NOMBRES[t]}</td><td class="n">${a.tablas[t]?.length ?? 0}</td><td class="n">${a.resumen[t]?.ganaderia || ''}</td><td class="n">${existentes[t]}</td>
          <td>${existentes[t] ? `<select data-t="${t}"><option value="omitir">Dejar como está</option><option value="reemplazar">Vaciar y volver a cargar</option></select>` : `<select data-t="${t}"><option value="importar">Importar</option><option value="omitir">Omitir</option></select>`}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="nota">También se crean los catálogos: ${a.catalogos.tareas.length} tareas, ${a.catalogos.proveedores.length} proveedores, ${a.catalogos.conceptos_gasto.length} conceptos de gasto y ${a.catalogos.compradores.length} compradores (los que ya existan se respetan).</p>
        ${a.avisos.length ? `<details class="avisos"><summary>${a.avisos.length} avisos</summary><ul>${a.avisos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
        <button class="btn primario" id="imp-go">Importar ahora</button>
        <pre id="imp-log" class="log" hidden></pre>
      </section>`;
    res.querySelector('#imp-go').addEventListener('click', async (ev) => {
      const plan = Object.fromEntries([...res.querySelectorAll('[data-t]')].map((s) => [s.dataset.t, s.value]));
      if (Object.values(plan).includes('reemplazar') && !confirm('Vas a BORRAR los datos actuales de las tablas marcadas «Vaciar y volver a cargar». ¿Continuar?')) return;
      ev.target.disabled = true;
      const log = res.querySelector('#imp-log'); log.hidden = false;
      const say = (m) => { log.textContent += m + '\n'; log.scrollTop = log.scrollHeight; };
      try { await ejecutar(a, plan, say); toast('Importación terminada'); } catch (err) { say('✗ ' + mensajeError(err)); toast('La importación se detuvo', 'error'); }
      ev.target.disabled = false;
    });
  }

  async function ejecutar(a, plan, say) {
    const sb = x.sb;
    // 1) vaciar (en orden inverso por dependencias)
    for (const t of [...ORDEN].reverse()) {
      if (plan[t] !== 'reemplazar') continue;
      const pk = 'id';
      const { error } = await sb.from(t).delete().gte(pk, 0);
      if (error) throw new Error(`No se pudo vaciar ${NOMBRES[t]}: ${error.message}`);
      say(`• ${NOMBRES[t]} vaciado`);
    }
    // 2) catálogos
    const cats = [['tareas', a.catalogos.tareas.map((nombre) => ({ nombre }))], ['proveedores', a.catalogos.proveedores.map((nombre) => ({ nombre }))],
      ['conceptos_gasto', a.catalogos.conceptos_gasto.map((nombre) => ({ nombre }))], ['compradores', a.catalogos.compradores.map((nombre) => ({ nombre, cif: a.cifs[nombre] ?? null }))]];
    for (const [t, filas] of cats) {
      for (let i = 0; i < filas.length; i += 400) {
        const { error } = await sb.from(t).upsert(filas.slice(i, i + 400), { onConflict: 'nombre', ignoreDuplicates: true });
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      say(`• Catálogo ${t}: ${filas.length}`);
      await x.refrescarCat(t);
    }
    const ids = () => Object.fromEntries(['entidades', 'cultivos', 'fincas', 'tareas', 'proveedores', 'compradores', 'conceptos_gasto', 'cuentas'].map((t) => [t, new Map(x.cat[t].map((r) => [r.nombre, r.id]))]));
    const resolver = (map, fila) => Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, v && typeof v === 'object' && v.__ref ? map[v.__ref].get(v.nombre) ?? null : v]));
    // 3) tablas
    for (const t of ORDEN) {
      if (plan[t] === 'omitir') { say(`– ${NOMBRES[t]}: omitido`); continue; }
      const filas = a.tablas[t] || [];
      if (t === 'fincas') {
        const map = ids();
        const lote = filas.map((f) => resolver(map, f));
        const { error } = await sb.from('fincas').upsert(lote, { onConflict: 'nombre', ignoreDuplicates: true });
        if (error) throw new Error(`fincas: ${error.message}`);
        await x.refrescarCat('fincas');
        say(`✓ Fincas: ${lote.length}`);
        continue;
      }
      const map = ids();
      const listas = filas.map((f) => resolver(map, f));
      for (let i = 0; i < listas.length; i += 300) {
        const { error } = await sb.from(t).insert(listas.slice(i, i + 300));
        if (error) throw new Error(`${NOMBRES[t]} (filas ${i + 1}-${i + 300}): ${error.message}`);
      }
      say(`✓ ${NOMBRES[t]}: ${listas.length}`);
      if (t === 'parcelas') await x.refrescarCat('parcelas');
    }
    say('Listo.');
  }
}
