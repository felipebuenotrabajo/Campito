// Reparto de gastos entre socios, igual que en el Excel (hojas «Cálculo Índices» y «Gastos 2026»).
//
// · Gastos de Hermanos Bueno SC, Agrobueno SC y «FBF» (común, no personal) se REPARTEN entre las explotaciones
//   según las hectáreas de cada una en el cultivo al que va el gasto (Olivos, Viñas, Almendros, Barbechos),
//   o según las hectáreas totales cuando el destino es «Todos».
// · Destino «Her» (Hermanos): a partes iguales entre Antonio, Pepe, Cati y Felipe.
// · Gastos personales (Antonio, Pepe, Cati, Felipe, y los marcados «personal» de FBF): van enteros a esa persona.
// · «Casa» y «A cuenta» solo existen como gasto directo; si llegan por una sociedad quedan «sin repartir».

export const PERSONAS = ['Antonio', 'Pepe', 'Cati', 'Felipe', 'FBF', 'Común'];
export const DESTINOS_REPARTO = ['Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Todos', 'Her', 'Casa', 'A cuenta', 'Cereales'];
const SOCIEDADES = ['Hermanos Bueno SC', 'Agrobueno SC'];
const HERMANOS = ['Antonio', 'Pepe', 'Cati', 'Felipe'];
const GRUPO_CULTIVO = { 'Viñas Blancas': 'Viñas', 'Viñas Tintas': 'Viñas', Olivos: 'Olivos', Almendros: 'Almendros', Barbechos: 'Barbechos', Cereales: 'Cereales' };

// Índices de reparto: hectáreas de cada explotación sobre el total de cada cultivo.
// parcelas: [{ ha, cultivo, explotacion }] (nombres, no ids)
export function calcularIndices(parcelas) {
  const ha = {}; // cultivo -> persona -> ha
  const tot = {};
  for (const p of parcelas) {
    const cult = GRUPO_CULTIVO[p.cultivo] ?? p.cultivo;
    const per = p.explotacion;
    const h = Number(p.ha) || 0;
    if (!cult || !per || !h) continue;
    for (const k of [cult, 'Todos']) {
      (ha[k] ??= {})[per] = ((ha[k] ??= {})[per] || 0) + h;
      tot[k] = (tot[k] || 0) + h;
    }
  }
  const idx = {};
  for (const k of Object.keys(ha)) idx[k] = Object.fromEntries(PERSONAS.map((p) => [p, tot[k] ? (ha[k][p] || 0) / tot[k] : 0]));
  return { idx, ha, tot };
}

// gastos: [{ total, destino, empresa, personal }] (empresa = nombre de la entidad)
export function repartirGastos(gastos, indices) {
  const m = {}; // persona -> destino -> €
  const comun = {}; // destino -> € a repartir (para auditar)
  const sin = []; // gastos que no se pueden repartir
  const suma = (p, d, v) => { ((m[p] ??= {})[d] = (m[p][d] || 0) + v); };
  for (const g of gastos) {
    const t = Number(g.total) || 0;
    const d = g.destino;
    if (!t) continue;
    const comunDe = SOCIEDADES.includes(g.empresa) || (g.empresa === 'FBF' && !g.personal);
    if (!d) { sin.push({ ...g, motivo: 'Sin destino' }); continue; }
    if (comunDe) {
      comun[d] = (comun[d] || 0) + t;
      if (d === 'Her') { for (const p of HERMANOS) suma(p, d, t / 4); continue; }
      const ix = indices.idx[d === 'Todos' ? 'Todos' : d];
      if (!ix || d === 'Casa' || d === 'A cuenta') { sin.push({ ...g, motivo: `«${d}» no se reparte entre socios` }); continue; }
      for (const p of PERSONAS) if (ix[p]) suma(p, d, t * ix[p]);
    } else if (PERSONAS.includes(g.empresa)) {
      suma(g.empresa, d, t);
    } else {
      sin.push({ ...g, motivo: 'Sin empresa a la que cargarlo' });
    }
  }
  return { m, comun, sin };
}

// ---------- Resultado por persona: ingresos y mano de obra ----------
export const CULTIVOS_GRUPO = ['Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Cereales'];
export const AYUDAS = 'Ayudas (PAC y subvenciones)';
export const GENERALES = 'Generales y otros';
export const FILAS_RESULTADO = [...CULTIVOS_GRUPO, AYUDAS, GENERALES];

export const grupoGasto = (destino) => (CULTIVOS_GRUPO.includes(destino) ? destino : GENERALES);

// Ayudas = tipo «Pac» o «Sub…» (como en el Excel, aunque el producto sea Olivos o Barbechos); el resto, por producto o tipo.
export function grupoIngreso(r) {
  const t = String(r.tipo || '').toLowerCase();
  const p = String(r.producto || '').toLowerCase();
  if (/^(pac|sub)/.test(t) || /^(pac|sub)/.test(p)) return AYUDAS;
  if (CULTIVOS_GRUPO.includes(r.producto)) return r.producto;
  if (['blanca', 'tinto', 'tinta'].includes(t)) return 'Viñas';
  if (['almazara', 'aderezo'].includes(t)) return 'Olivos';
  if (t === 'almendras') return 'Almendros';
  return GENERALES;
}

// Ingresos: van al «agricultor real» de cada ingreso.
export function repartirIngresos(ingresos) {
  const m = {}; const sin = [];
  for (const r of ingresos) {
    const t = Number(r.total) || 0;
    if (!t) continue;
    if (!PERSONAS.includes(r.agricultor)) { sin.push(r); continue; }
    const g = grupoIngreso(r);
    ((m[r.agricultor] ??= {})[g] = (m[r.agricultor][g] || 0) + t);
  }
  return { m, sin };
}

// Mano de obra: cada jornada va a la explotación de su finca. Sin finca: a quien la pagó, y si no, por hectáreas del cultivo.
// filas: [{ tajo, coste, explotacion (de la finca), pagadoPor }]
export function repartirManoObra(filas, indices) {
  const m = {}; const suma = (p, g, v) => ((m[p] ??= {})[g] = (m[p][g] || 0) + v);
  for (const r of filas) {
    const c = Number(r.coste) || 0;
    if (!c) continue;
    const g = CULTIVOS_GRUPO.includes(r.tajo) ? r.tajo : GENERALES;
    const directo = [r.explotacion, r.pagadoPor].find((p) => PERSONAS.includes(p));
    if (directo) { suma(directo, g, c); continue; }
    const ix = indices.idx[CULTIVOS_GRUPO.includes(r.tajo) ? r.tajo : 'Todos'] ?? indices.idx.Todos;
    for (const p of PERSONAS) if (ix?.[p]) suma(p, g, c * ix[p]);
  }
  return m;
}

// Une gastos, ingresos y mano de obra: persona -> grupo -> { ingresos, gastos, mo }
export function resultadoPorPersona(gastosRep, ingRep, mo) {
  const out = {};
  const celda = (p, g) => ((out[p] ??= {})[g] ??= { ingresos: 0, gastos: 0, mo: 0 });
  for (const [p, o] of Object.entries(gastosRep.m)) for (const [d, v] of Object.entries(o)) celda(p, grupoGasto(d)).gastos += v;
  for (const [p, o] of Object.entries(ingRep.m)) for (const [g, v] of Object.entries(o)) celda(p, g).ingresos += v;
  for (const [p, o] of Object.entries(mo)) for (const [g, v] of Object.entries(o)) celda(p, g).mo += v;
  return out;
}
