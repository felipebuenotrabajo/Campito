// Motor genérico: listado + filtros + formulario de alta/edición para cualquier entidad de esquema.js
import { ENTIDADES } from './esquema.js';
import { $, $$, esc, eur, numf, fechaf, hoy, MESES, sumar, toast, descargarCSV } from './util.js';
import { clave } from './parser.js';
import { consultar, bloqueHTML, hayCodigo } from './sigpac.js';

const PAGINA = 100;
const NUM = new Set(['num', 'eur', 'int']);

export async function cargarTodo(sb, tabla, orden = [], select = '*', filtro = null) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    let q = sb.from(tabla).select(select);
    if (filtro) q = filtro(q);
    for (const [k, asc] of orden) q = q.order(k, { ascending: asc });
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export function mensajeError(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto (revisa tu rol).';
  if (/violates foreign key/i.test(m)) return 'No se puede borrar: hay otros registros que dependen de este.';
  if (/duplicate key|unique/i.test(m)) return 'Ya existe un registro con ese nombre o valor.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor.';
  return m;
}

// Texto visible de una celda
export function valorTexto(col, r, x) {
  const v = r[col.k];
  if (v == null || v === '') return '';
  switch (col.tipo) {
    case 'fk': return x.nombre(col.cat, v) ?? '';
    case 'fecha': return fechaf(v);
    case 'bool': return v ? 'Sí' : '';
    case 'eur': return eur(v);
    case 'num': return numf(v, 3);
    case 'int': return String(v);
    default: return String(v);
  }
}
const fmtTotal = (t, v) => (t === 'eur' ? eur(v) : numf(v, t === 'num' ? 2 : 0));
const fmtTarjeta = (t, v) => (v == null || v === '' ? '' : t === 'eur' ? eur(v) : t === 'ha' ? numf(v, 2) + ' ha' : t === 'kg' ? numf(v, 0) + ' kg' : t === 'ud' ? v + ' ud.' : numf(v));

export async function montarCrud(id, cont, x) {
  const cfg = ENTIDADES[id];
  const pk = cfg.pk || 'id';
  const puedeEditar = x.rol === 'admin' || x.rol === 'editor';
  const puedeBorrar = x.rol === 'admin';
  const listaCols = cfg.cols.filter((c) => c.lista);
  const st = { filas: [], q: '', anio: '', mes: '', filtros: {}, orden: { k: cfg.orden?.[0]?.[0], asc: cfg.orden?.[0]?.[1] }, visibles: PAGINA };

  cont.innerHTML = `<div class="cargando">Cargando ${esc(cfg.titulo.toLowerCase())}…</div>`;
  async function recargar() {
    st.filas = await cargarTodo(x.sb, cfg.tabla, cfg.orden);
    cfg.derivar?.(st.filas, x);
    for (const r of st.filas) for (const col of cfg.cols) if (col.calc) r[col.k] = col.calc(r, x);
    for (const r of st.filas) r._q = clave(cfg.cols.filter((c) => c.lista || c.k === 'notas').map((c) => valorTexto(c, r, x)).join(' '));
  }
  try { await recargar(); } catch (e) { cont.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(mensajeError(e))}</div>`; return; }

  if (cfg.fechaCol) {
    const anios = [...new Set(st.filas.map((r) => String(r[cfg.fechaCol]).slice(0, 4)))].sort().reverse();
    const actual = String(new Date().getFullYear());
    st.anio = anios.includes(actual) ? actual : anios[0] || '';
  }

  // ----- estructura -----
  const optsFiltro = (f) => {
    if (f.tipo === 'fk') return [...(x.cat[f.cat] || [])].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')).map((o) => [String(o.id), o.nombre]);
    if (f.tipo === 'select') return f.opciones.map((o) => [o, o]);
    const vals = [...new Set(st.filas.map((r) => r[f.k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
    return vals.map((v) => [String(v), String(v)]);
  };
  cont.innerHTML = `
    <header class="cab">
      <h1>${esc(cfg.titulo)}</h1>
      ${puedeEditar && cfg.sigpac ? `<button class="btn suave" data-a="sigpac-todas" title="Descarga el contorno y las hectáreas de todas las parcelas">Actualizar desde SIGPAC</button>` : ''}
      ${puedeEditar ? `<button class="btn primario" data-a="nuevo">+ Añadir</button>` : ''}
    </header>
    <div class="barra">
      <input type="search" class="buscar" placeholder="Buscar…" aria-label="Buscar" autocomplete="off">
      ${cfg.fechaCol ? `<select data-f="_anio" aria-label="Año"><option value="">Todos los años</option></select>
      <select data-f="_mes" aria-label="Mes"><option value="">Todo el año</option>${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>` : ''}
      ${(cfg.filtros || []).map((f) => `<select data-f="${f.k}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: todos</option>${optsFiltro(f).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`).join('')}
      <button class="btn suave" data-a="csv" title="Descargar lo que ves en una hoja de cálculo">Exportar CSV</button>
    </div>
    <div class="resumen-lista" aria-live="polite"></div>
    <div class="lista"></div>`;
  if (cfg.fechaCol) {
    const anios = [...new Set(st.filas.map((r) => String(r[cfg.fechaCol]).slice(0, 4)))].sort().reverse();
    $('[data-f=_anio]', cont).insertAdjacentHTML('beforeend', anios.map((a) => `<option value="${a}">${a}</option>`).join(''));
    $('[data-f=_anio]', cont).value = st.anio;
  }

  const filtradas = () => {
    const q = clave(st.q);
    let r = st.filas.filter((f) => {
      if (cfg.fechaCol) {
        const fe = String(f[cfg.fechaCol]);
        if (st.anio && fe.slice(0, 4) !== st.anio) return false;
        if (st.mes && +fe.slice(5, 7) !== +st.mes) return false;
      }
      for (const [k, v] of Object.entries(st.filtros)) if (v !== '' && String(f[k] ?? '') !== v) return false;
      return !q || f._q.includes(q);
    });
    const { k, asc } = st.orden;
    if (k) {
      const col = cfg.cols.find((c) => c.k === k);
      const num = col && NUM.has(col.tipo);
      r = [...r].sort((a, b) => {
        let va = col?.tipo === 'fk' ? x.nombre(col.cat, a[k]) : a[k], vb = col?.tipo === 'fk' ? x.nombre(col.cat, b[k]) : b[k];
        if (va == null) return 1; if (vb == null) return -1;
        const cmp = num ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
        return asc ? cmp : -cmp;
      });
    }
    return r;
  };

  function pintar() {
    const filas = filtradas();
    const totales = (cfg.totales || []).map((t) => `<span><b>${fmtTotal(t.tipo, sumar(filas, t.k))}</b> ${esc(t.label.toLowerCase())}</span>`).join('');
    $('.resumen-lista', cont).innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? 'registro' : 'registros'}</span>${totales}`;
    const vis = filas.slice(0, st.visibles);
    if (!filas.length) { $('.lista', cont).innerHTML = `<div class="vacio">No hay nada que mostrar${st.q || Object.values(st.filtros).some(Boolean) ? ' con estos filtros' : ' todavía'}.</div>`; return; }
    const th = listaCols.map((c) => `<th class="${NUM.has(c.tipo) ? 'n' : ''} ${st.orden.k === c.k ? (st.orden.asc ? 'asc' : 'desc') : ''}" data-ord="${c.k}" ${c.soloLista ? 'data-nosort' : ''}>${esc(c.label)}</th>`).join('');
    const tr = vis.map((r) => `<tr data-id="${esc(r[pk])}">${listaCols.map((c) => `<td class="${NUM.has(c.tipo) ? 'n' : ''}">${esc(valorTexto(c, r, x))}</td>`).join('')}</tr>`).join('');
    const T = cfg.tarjeta;
    const cards = vis.map((r) => `<button class="tarjeta" data-id="${esc(r[pk])}"><span class="t">${esc(T.t(r, x))}</span><span class="v">${esc(fmtTarjeta(T.vt, T.v(r, x)))}</span><span class="s">${esc(T.s(r, x))}</span>${cfg.fechaCol ? `<span class="f">${fechaf(r[cfg.fechaCol])}</span>` : ''}</button>`).join('');
    $('.lista', cont).innerHTML = `<div class="tabla-wrap"><table class="tabla"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div><div class="tarjetas">${cards}</div>
      ${filas.length > vis.length ? `<button class="btn suave mas" data-a="mas">Mostrar más (${filas.length - vis.length} restantes)</button>` : ''}`;
  }
  pintar();

  // ----- eventos del listado -----
  cont.addEventListener('input', (e) => { if (e.target.matches('.buscar')) { st.q = e.target.value; st.visibles = PAGINA; pintar(); } });
  cont.addEventListener('change', (e) => {
    const f = e.target.dataset?.f;
    if (!f) return;
    if (f === '_anio') st.anio = e.target.value; else if (f === '_mes') st.mes = e.target.value; else st.filtros[f] = e.target.value;
    st.visibles = PAGINA; pintar();
  });
  cont.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a],[data-id],[data-ord]');
    if (!t) return;
    if (t.dataset.a === 'nuevo') return abrirForm(null);
    if (t.dataset.a === 'sigpac-todas') return sigpacTodas(t);
    if (t.dataset.a === 'mas') { st.visibles += PAGINA; return pintar(); }
    if (t.dataset.a === 'csv') {
      const filas = filtradas();
      return descargarCSV(`${id}.csv`, listaCols.map((c) => c.label), filas.map((r) => listaCols.map((c) => (c.tipo === 'fecha' ? r[c.k] ?? '' : NUM.has(c.tipo) ? r[c.k] ?? '' : valorTexto(c, r, x)))));
    }
    if (t.dataset.ord !== undefined && t.tagName === 'TH' && !('nosort' in t.dataset)) {
      st.orden = { k: t.dataset.ord, asc: st.orden.k === t.dataset.ord ? !st.orden.asc : true }; return pintar();
    }
    if (t.dataset.id !== undefined) { const r = st.filas.find((f) => String(f[pk]) === t.dataset.id); if (r) abrirForm(r); }
  });

  async function sigpacTodas(btn) {
    const todas = st.filas.filter(hayCodigo);
    if (!confirm(`Se consultará SIGPAC para ${todas.length} parcelas y se guardará su contorno. ¿Continuar?`)) return;
    btn.disabled = true;
    const fallos = [];
    for (let i = 0; i < todas.length; i++) {
      btn.textContent = `SIGPAC ${i + 1}/${todas.length}…`;
      try {
        const sg = await consultar(todas[i]);
        const { error } = await x.sb.from('parcelas').update({ sigpac: sg }).eq('id', todas[i].id);
        if (error) throw error;
      } catch (e) { fallos.push(`${todas[i].nombre} ${todas[i].poligono}/${todas[i].parcela}: ${e.message || e}`); }
    }
    btn.disabled = false; btn.textContent = 'Actualizar desde SIGPAC';
    await recargar(); pintar();
    toast(fallos.length ? `Hecho, con ${fallos.length} fallos` : `Contorno de ${todas.length} parcelas guardado`, fallos.length ? 'error' : 'ok');
    if (fallos.length) alert('No se pudieron actualizar:\n\n' + fallos.join('\n'));
  }

  // ----- formulario -----
  function abrirForm(reg, duplicando = false) {
    const nuevo = !reg || duplicando;
    const base = nuevo ? { ...(cfg.defaults?.(x) || {}), ...(duplicando ? Object.fromEntries(cfg.cols.filter((c) => !c.calc).map((c) => [c.k, reg[c.k]])) : {}) } : reg;
    if (nuevo && cfg.fechaCol && !base[cfg.fechaCol]) base[cfg.fechaCol] = hoy();
    for (const c of cfg.cols) if (nuevo && base[c.k] == null && c.def !== undefined) base[c.k] = c.def;
    if (nuevo && cfg.numeracion && !base[cfg.numeracion.campo]) base[cfg.numeracion.campo] = siguienteNumero(base[cfg.fechaCol]);

    const campos = cfg.cols.filter((c) => !c.calc && !c.soloLista);
    let grupoActual = null;
    const html = campos.map((c) => {
      const head = c.grupo && c.grupo !== grupoActual ? `<h3 class="grupo">${esc(c.grupo)}</h3>` : '';
      if (c.grupo) grupoActual = c.grupo;
      const v = base[c.k];
      const dis = puedeEditar ? '' : 'disabled';
      let input;
      const id = `f_${c.k}`;
      if (c.tipo === 'area') input = `<textarea id="${id}" name="${c.k}" rows="3" ${dis}>${esc(v ?? '')}</textarea>`;
      else if (c.tipo === 'bool') input = `<label class="sw"><input type="checkbox" id="${id}" name="${c.k}" ${v ? 'checked' : ''} ${dis}><span>${esc(c.label)}</span></label>`;
      else if (c.tipo === 'select') input = `<select id="${id}" name="${c.k}" ${dis}>${c.req ? '' : '<option value=""></option>'}${c.opciones.map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else if (c.tipo === 'fk') {
        const lista = [...(x.cat[c.cat] || [])].sort((a, b) => (c.cat === 'entidades' ? a.orden - b.orden : (a.nombre || '').localeCompare(b.nombre || '', 'es')));
        input = `<div class="fk"><select id="${id}" name="${c.k}" ${dis}><option value=""></option>${lista.map((o) => `<option value="${o.id}" ${String(v) === String(o.id) ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>${c.nuevo && puedeEditar ? `<button type="button" class="btn suave mini" data-nuevo="${c.k}" title="Crear nuevo" aria-label="Crear nuevo ${esc(c.label)}">+</button>` : ''}</div>`;
      } else if (c.tipo === 'fecha') input = `<input type="date" id="${id}" name="${c.k}" value="${esc(v ?? '')}" ${dis}>`;
      else {
        const dl = c.sugerencias ? `list="dl_${c.k}"` : '';
        const modo = c.tipo === 'int' ? 'numeric' : NUM.has(c.tipo) ? 'decimal' : 'text';
        input = `<input type="text" inputmode="${modo}" id="${id}" name="${c.k}" value="${esc(v ?? '')}" ${dl} autocomplete="off" ${dis}>${c.sugerencias ? `<datalist id="dl_${c.k}">${c.sugerencias.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}`;
      }
      const lab = c.tipo === 'bool' ? '' : `<label for="${id}">${esc(c.label)}${c.req ? ' <i>*</i>' : ''}</label>`;
      return `${head}<div class="campo ${c.tipo === 'area' ? 'ancho' : ''}" data-campo="${c.k}">${lab}${input}${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}</div>`;
    }).join('');

    let enl = '';
    if (!nuevo && cfg.enlaces) {
      const e = cfg.enlaces(base);
      enl = `<div class="enlaces">${e.links.map((l) => `<a class="btn suave mini" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.t)} ↗</a>`).join('')}${e.nota ? `<small>${esc(e.nota)}</small>` : ''}</div>`;
    }
    if (!nuevo && cfg.sigpac) enl += '<div class="sg-cont"></div>';
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    const extra = (cfg.calc || cfg.cols.some((c) => c.calc && c.lista)) ? '<div class="calc-pie"></div>' : '';
    dlg.innerHTML = `<form method="dialog" novalidate>
      <header><h2>${nuevo ? 'Añadir' : puedeEditar ? 'Editar' : 'Ver'} ${esc(cfg.singular)}</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
      ${enl}<div class="campos">${html}</div>${extra}
      <footer>
        ${!nuevo && puedeBorrar ? '<button type="button" class="btn peligro" data-borrar>Eliminar</button>' : ''}
        ${!nuevo && puedeEditar ? '<button type="button" class="btn suave" data-duplicar>Duplicar</button>' : ''}
        <span class="sp"></span>
        <button type="button" class="btn suave" data-cerrar>${puedeEditar ? 'Cancelar' : 'Cerrar'}</button>
        ${puedeEditar ? '<button type="submit" class="btn primario" data-guardar>Guardar</button>' : ''}
      </footer></form>`;
    document.body.append(dlg);
    dlg.showModal();
    dlg.addEventListener('close', () => dlg.remove());
    const form = $('form', dlg);
    const pintarSigpac = () => { const c = $('.sg-cont', dlg); if (c) c.innerHTML = bloqueHTML(reg, puedeEditar); };
    pintarSigpac();

    // cálculo automático (p. ej. total = importe + IVA)
    const leer = () => {
      const v = {};
      for (const c of campos) v[c.k] = leerCampo(c, form);
      return v;
    };
    const pieCalc = () => {
      const pie = $('.calc-pie', dlg);
      if (!pie) return;
      const v = leer();
      const fila = { ...base, ...v };
      const partes = cfg.cols.filter((c) => c.calc && c.lista).map((c) => `${c.label}: <b>${c.tipo === 'eur' ? eur(c.calc(fila, x)) : numf(c.calc(fila, x))}</b>`);
      pie.innerHTML = partes.join(' · ');
    };
    const manual = new Set();
    for (const a of cfg.auto || []) {
      if (!nuevo) { const val = a.fn(leer()); if (val != null && Math.abs(val - (Number(base[a.campo]) || 0)) > 0.01) manual.add(a.campo); }
      $(`[name=${a.campo}]`, form)?.addEventListener('input', () => manual.add(a.campo));
      for (const d of a.desde) $(`[name=${d}]`, form)?.addEventListener('input', () => {
        if (manual.has(a.campo)) return;
        const val = a.fn(leer());
        if (val != null) $(`[name=${a.campo}]`, form).value = String(val).replace('.', ',');
        pieCalc();
      });
    }
    form.addEventListener('input', pieCalc);
    pieCalc();

    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-cerrar]')) return dlg.close();
      const nuevoCat = e.target.closest('[data-nuevo]');
      if (nuevoCat) {
        const col = cfg.cols.find((c) => c.k === nuevoCat.dataset.nuevo);
        const nombre = (prompt(`Nombre del nuevo valor para «${col.label}»:`) || '').trim();
        if (!nombre) return;
        const { data, error } = await x.sb.from(col.cat).insert({ nombre }).select().single();
        if (error) return toast(mensajeError(error), 'error');
        await x.refrescarCat(col.cat);
        const sel = $(`[name=${col.k}]`, form);
        sel.insertAdjacentHTML('beforeend', `<option value="${data.id}">${esc(nombre)}</option>`);
        sel.value = String(data.id);
        toast(`«${nombre}» añadido`);
      }
      if (e.target.closest('[data-sigpac]')) {
        const b = e.target.closest('[data-sigpac]'); b.disabled = true; b.textContent = 'Consultando SIGPAC…';
        try {
          const sg = await consultar(reg);
          const { error } = await x.sb.from('parcelas').update({ sigpac: sg }).eq('id', reg.id);
          if (error) throw error;
          reg.sigpac = sg; toast('Contorno actualizado');
        } catch (er) { toast(mensajeError(er), 'error'); }
        pintarSigpac(); recargar().then(pintar);
      }
      if (e.target.closest('[data-duplicar]')) { dlg.close(); abrirForm(reg, true); }
      if (e.target.closest('[data-borrar]')) {
        if (!confirm(`¿Eliminar este ${cfg.singular}? No se puede deshacer.`)) return;
        const { error } = await x.sb.from(cfg.tabla).delete().eq(pk, reg[pk]);
        if (error) return toast(mensajeError(error), 'error');
        toast('Eliminado'); dlg.close(); await recargar(); pintar();
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!puedeEditar) return;
      const v = leer();
      for (const c of campos) if (c.req && (v[c.k] == null || v[c.k] === '')) { toast(`Falta «${c.label}»`, 'error'); $(`[name=${c.k}]`, form)?.focus(); return; }
      if (cfg.tabla === 'miembros') v.email = v.email.toLowerCase();
      const btn = $('[data-guardar]', form); btn.disabled = true;
      const { error } = nuevo ? await x.sb.from(cfg.tabla).insert(v) : await x.sb.from(cfg.tabla).update(v).eq(pk, reg[pk]);
      btn.disabled = false;
      if (error) return toast(mensajeError(error), 'error');
      toast(nuevo ? 'Añadido' : 'Guardado');
      if (['entidades', 'cultivos', 'fincas', 'tareas', 'proveedores', 'compradores', 'conceptos_gasto', 'cuentas', 'parcelas'].includes(cfg.tabla)) await x.refrescarCat(cfg.tabla);
      dlg.close(); await recargar(); pintar();
    });
    setTimeout(() => $('input:not([type=checkbox]),select', form)?.focus({ preventScroll: true }), 50);
  }

  function siguienteNumero(fecha) {
    const yy = String(fecha || hoy()).slice(2, 4);
    const pref = cfg.numeracion.prefijo(yy);
    let max = 0;
    for (const r of st.filas) {
      const n = r[cfg.numeracion.campo];
      if (typeof n === 'string' && n.startsWith(pref)) max = Math.max(max, parseInt(n.slice(pref.length), 10) || 0);
    }
    return `${pref}${max + 1}`;
  }
}

function leerCampo(c, form) {
  const el = $(`[name=${c.k}]`, form);
  if (!el) return null;
  if (c.tipo === 'bool') return el.checked;
  const raw = el.value.trim();
  if (raw === '') return null;
  if (c.tipo === 'num' || c.tipo === 'eur') { const n = parseFloat(raw.replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  if (c.tipo === 'int') { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : null; }
  if (c.tipo === 'fk') return Number(raw);
  return raw;
}
