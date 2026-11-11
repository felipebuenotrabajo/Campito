// Convierte las hojas del Excel maestro en filas limpias para la base de datos.
// Funciona igual en el navegador y en Node. Recibe { nombreHoja: filas[][] } (filas 0-indexadas).
// Sin ganadería: se descarta todo lo relacionado con la granja / Bubesa / cerdos.

// ---------- utilidades ----------
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const clave = (v) => (v == null ? '' : sinAcentos(String(v)).toLowerCase().replace(/\s+/g, ' ').trim());
const txt = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};
const num = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const entero = (v) => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};
const si = (v) => ['s', 'si', 'sí', 'true', '1', 'x'].includes(clave(v));

const iso = (d) => d.toISOString().slice(0, 10);
const valida = (y, m, d) =>
  y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;

export function fecha(v, permitirSerial = true) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : iso(new Date(v.getTime() + 12 * 3600e3));
  if (typeof v === 'number') return permitirSerial && Number.isInteger(v) && v > 20000 && v < 80000 ? iso(new Date(Math.round((v - 25569) * 86400e3))) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return valida(y, +m[2], +m[1]);
  }
  return null;
}

// Mantiene la primera grafía vista de cada nombre (ignora mayúsculas, acentos y espacios)
class Canon {
  constructor(arreglos = {}) { this.m = new Map(); this.arreglos = arreglos; }
  de(v) {
    let s = txt(v);
    if (!s) return null;
    const k0 = clave(s);
    if (this.arreglos[k0]) s = this.arreglos[k0];
    const k = clave(s);
    if (!this.m.has(k)) this.m.set(k, s);
    return this.m.get(k);
  }
  get valores() { return [...this.m.values()]; }
}

export const ref = (tabla, nombre) => (nombre == null ? null : { __ref: tabla, nombre });

// ---------- entidades ----------
const ALIAS = {
  antonio: 'Antonio', pepe: 'Pepe', ada: 'Ada', cati: 'Cati', catalina: 'Cati',
  felipe: 'Felipe', fhijo: 'FBF', fbf: 'FBF',
  her: 'Hermanos Bueno SC', hnos: 'Hermanos Bueno SC', 'hnos bueno': 'Hermanos Bueno SC',
  'hermanos bueno': 'Hermanos Bueno SC', 'hermanos bueno sc': 'Hermanos Bueno SC',
  agro: 'Agrobueno SC', agrobueno: 'Agrobueno SC', 'agrobueno sc': 'Agrobueno SC',
  comun: 'Común',
};

// ---------- ganadería (se excluye) ----------
const GANADERIA = /granja|bubesa|cerd|guarr|lechon|verrac|porcin|ganad|corralina|destet|capar /;
const esGanaderia = (...vals) => vals.some((v) => v != null && GANADERIA.test(clave(v)));

const normClaves = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [clave(k), v]));
const CULTIVO_DE = normClaves({
  tinta: 'Viñas Tintas', 'viñas tintas': 'Viñas Tintas', tinto: 'Viñas Tintas',
  blanca: 'Viñas Blancas', 'viñas blancas': 'Viñas Blancas',
  olivos: 'Olivos', almendros: 'Almendros', barbecho: 'Barbechos', barbechos: 'Barbechos', cereales: 'Cereales',
});
const TAJO_DE = normClaves({
  'viñas': 'Viñas', olivos: 'Olivos', almendros: 'Almendros', barbechos: 'Barbechos', cereales: 'Cereales',
  'dia de orden': 'Día de orden', casa: 'Casa',
});
const DESTINO_DE = normClaves({
  todos: 'Todos', 'viñas': 'Viñas', olivos: 'Olivos', almendros: 'Almendros', barbechos: 'Barbechos', cereales: 'Cereales',
  casa: 'Casa', 'a cuenta': 'A cuenta', her: 'Her',
});
const AGREGADOS = new Set(['almendros', 'barbechos', 'olivos', 'vinas', 'general', 'casa']);

// Parcela SIGPAC -> finca de trabajo (el Excel agrupa varias parcelas en una finca)
const lote = (p) => clave(p.lote);
const REGLAS_FINCA = [
  [/^casablanca \(toro\)/, () => 'Toro'],
  [/^casablanca$/, () => 'Casablanca'],
  [/^casaquemada/, () => 'Casaquemada'],
  [/^cerca (abajo|arriba)/, () => 'Cerca'],
  [/^chacona/, () => 'Gata'],
  [/^cincho \(cincho olivos\)/, () => 'Cincho Olivos'],
  [/^cincho$/, () => 'Cincho'],
  [/^contadero de abajo/, () => 'Ada Contadero'],
  [/^el ahorcado/, (p) => (lote(p) === 'ada' ? 'Ada Ahorcado' : 'Ahorcado')],
  [/^el asiento/, () => 'Asiento'],
  [/^el garzon/, () => 'Ada Garzón'],
  [/^el mosco/, () => 'Mosco'],
  [/^el pozuelo/, () => 'Pozuelo (Pozo)'],
  [/^encinas altas/, () => 'Encinas Altas'],
  [/^garandina/, () => 'Ada Garandina'],
  [/^la garandina/, () => 'Tenderas'],
  [/^la monja/, () => 'La Monja'],
  [/^las alforjas/, () => 'Alforjas'],
  [/^las chamorra/, () => 'Chamorra'],
  [/^las colegiatas/, () => 'Colegiata'],
  [/^las cumbres/, () => 'Poca Ludia'],
  [/^las dieciseis/, () => 'Dieciseis'],
  [/^las hoyas/, () => 'Contadero'],
  [/^las veinte/, (p) => (lote(p) === 'ada' ? 'Ada Veinte' : 'Veinte')],
  [/^los afligidos/, () => 'Afligidos'],
  [/^los llanos de san juan/, (p) => (clave(p.cultivo) === 'olivos' ? 'San Juan Olivos' : 'San Juan')],
  [/^los medios/, () => 'Ada Medios'],
  [/^los picos/, () => 'Los Picos'],
  [/^los silos/, () => 'Los Silos'],
  [/^lumbrarillo \(pozuelo\)/, () => 'Ada Pozuelo'],
  [/^lumbrarillo/, (p) => (clave(p.cultivo) === 'almendros' ? 'Lumbrarillo Almendros' : 'Lumbrarillo Olivos')],
  [/^manchego/, () => 'Medios'],
  [/^mesas/, () => 'Mesas'],
  [/^miradiaz/, () => 'Miradiaz'],
  [/^monji(as|tas)/, () => 'Monjita'],
  [/^palomares/, () => 'Palomares'],
  [/^pedraza/, () => 'Pedraza'],
  [/^penagorda/, () => 'Peñagorda'],
  [/^picones/, () => 'Picones'],
  [/^salado/, () => 'Salado'],
  [/^silos/, () => 'Silos'],
];

const ARREGLOS_REF = { soliitd: 'Solicitud', enccargo: 'Encargo', contrto: 'Contrato', tramitre: 'Trámite', encueta: 'Encuesta', 'hnos bueno': 'Hermanos Bueno' };

// ---------- análisis principal ----------
export function analizar(hojas) {
  const avisos = [];
  const resumen = {};
  const warn = (m) => { if (avisos.length < 200) avisos.push(m); };
  const desconocidos = new Set();
  const ent = (v, donde) => {
    const k = clave(v);
    if (!k) return null;
    if (ALIAS[k]) return ALIAS[k];
    if (!AGREGADOS.has(k) && k !== 'general') desconocidos.add(`${donde}: "${txt(v)}"`);
    return null;
  };
  const stat = (t) => (resumen[t] ??= { leidas: 0, importadas: 0, ganaderia: 0, descartadas: 0 });

  const tareas = new Canon(), proveedores = new Canon(), compradores = new Canon(), conceptos = new Canon(),
    modalidades = new Canon(), refs = new Canon(ARREGLOS_REF), afectaA = new Canon(ARREGLOS_REF);
  const tablas = {};

  // ===== Fincas (catálogo del Diario, columnas V:Z) =====
  const diario = hojas['Diario de trabajo 2026'] || [];
  const fincaCanon = new Map(); // clave -> nombre canónico
  const fincas = [];
  for (let i = 2; i < Math.min(diario.length, 120); i++) {
    const f = diario[i];
    const nombre = txt(f?.[21]);
    if (!nombre || AGREGADOS.has(clave(nombre))) continue;
    const n = clave(nombre) === 'lumbrarillo olivos' ? 'Lumbrarillo Olivos' : nombre;
    if (fincaCanon.has(clave(n))) continue;
    fincaCanon.set(clave(n), n);
    fincas.push({
      nombre: n,
      cultivo_id: ref('cultivos', CULTIVO_DE[clave(f[23])] ?? null),
      explotacion_id: ref('entidades', ent(f[24], 'finca.explotación')),
      lote_id: ref('entidades', ent(f[25], 'finca.lote')),
    });
  }
  tablas.fincas = fincas;
  stat('fincas').leidas = fincas.length; stat('fincas').importadas = fincas.length;
  const fincaDe = (v, donde) => {
    const k = clave(v);
    if (!k || AGREGADOS.has(k)) return null;
    const n = fincaCanon.get(k);
    if (!n) { warn(`${donde}: finca desconocida "${txt(v)}"`); return null; }
    return n;
  };

  // ===== Parcelas =====
  const hp = hojas['Parcelas'] || [];
  tablas.parcelas = [];
  for (let i = 2; i < hp.length; i++) {
    const f = hp[i];
    const nombre = txt(f?.[1]);
    if (!nombre) continue;
    stat('parcelas').leidas++;
    const cultivo = CULTIVO_DE[clave(f[14])] ?? null;
    const p = { nombre, lote: ent(f[25], 'parcela.lote'), cultivo };
    const regla = REGLAS_FINCA.find(([re]) => re.test(clave(nombre)));
    const finca = regla ? regla[1](p) : null;
    if (!finca || !fincaCanon.has(clave(finca))) warn(`Parcela "${nombre}" sin finca asignada`);
    tablas.parcelas.push({
      nombre, codigo: entero(f[0]), poligono: txt(f[2]), parcela: txt(f[3]), recinto: txt(f[4]), termino: txt(f[5]),
      ha_sigpac: num(f[7]), ha_otros_recintos: num(f[9]), pendiente: num(f[8]),
      region: txt(f[11]), lic_zepa: txt(f[12]), nitratos: txt(f[13]),
      cultivo_id: ref('cultivos', cultivo), variedad: txt(f[15]), anio_plantacion: entero(f[16]),
      agroambientales: txt(f[17]), titular_catastro: txt(f[18]), propietario: txt(f[19]),
      n_parcela_registral: txt(f[20]), reg_viticola: txt(f[21]), n_olivos_do: entero(f[22]),
      comunidad_regantes: txt(f[23]),
      explotacion_id: ref('entidades', ent(f[24], 'parcela.explotación')), lote_id: ref('entidades', p.lote),
      tasacion_reparto: num(f[26]), toma_agua: txt(f[27]), expediente_riego: txt(f[28]),
      finca_id: ref('fincas', finca && fincaCanon.get(clave(finca))),
    });
    stat('parcelas').importadas++;
  }

  // ===== Tareas (catálogo del diario, col U) =====
  for (let i = 2; i < diario.length; i++) {
    const t = txt(diario[i]?.[20]);
    if (t && !esGanaderia(t)) tareas.de(t);
  }

  // ===== Diario de trabajo =====
  tablas.diario_trabajo = [];
  for (let i = 2; i < diario.length; i++) {
    const f = diario[i];
    const fe = fecha(f?.[0]);
    const tajo = TAJO_DE[clave(f?.[1])];
    if (!fe || !tajo) continue;
    const s = stat('diario_trabajo');
    s.leidas++;
    if (esGanaderia(f[3], f[1])) { s.ganaderia++; continue; }
    const trab = num(f[2]) ?? 1;
    const hpp = num(f[5]);
    const horas = num(f[9]) ?? (hpp != null ? hpp * trab : null);
    if (!horas || horas <= 0) { s.descartadas++; continue; }
    tablas.diario_trabajo.push({
      fecha: fe, tajo, trabajadores: trab, tarea_id: ref('tareas', tareas.de(f[3])),
      finca_id: ref('fincas', fincaDe(f[4], 'diario')), horas_por_peon: hpp, horas,
      precio_jornal: num(f[11]) ?? 59.85, pagado_por_id: ref('entidades', ent(f[13], 'diario.pagado por')),
    });
    s.importadas++;
  }

  // ===== Gastos =====
  const hg = hojas['Gastos 2026'] || [];
  tablas.gastos = [];
  for (let i = 3; i < hg.length; i++) {
    const f = hg[i];
    const fe = fecha(f?.[2]);
    if (!fe) continue;
    const s = stat('gastos');
    s.leidas++;
    if (esGanaderia(f[3], f[5], f[6], f[7], f[9], f[10], f[18])) { s.ganaderia++; continue; }
    const iva0 = num(f[13]) ?? 0;
    const iva = iva0 > 0 && iva0 < 1 ? iva0 * 100 : iva0;
    const cant = num(f[4]) ?? 1;
    let importe = num(f[12]); // importe unitario sin IVA
    let total = num(f[14]);   // total = importe × (1 + IVA) × cantidad
    if (total == null && importe != null) total = Math.round(importe * (1 + iva / 100) * cant * 100) / 100;
    if (importe == null && total != null && cant) importe = Math.round((total / (1 + iva / 100) / cant) * 1e6) / 1e6;
    if (importe == null && total == null && !txt(f[3])) { s.descartadas++; continue; }
    // Forma de pago: «Cmpensado 26-149» → Compensado (+ referencia en Aplicación); «Pay Pal» → PayPal
    let pago = txt(f[16]), aplic = txt(f[9]);
    const comp = /^c-?o?mpensad[oa]\s*(.*)$/i.exec(pago || '');
    if (comp) { pago = 'Compensado'; if (comp[1]) aplic = [aplic, `Compensado con ${comp[1].trim()}`].filter(Boolean).join(' · '); }
    else if (/^pay\s*pal$/i.test(pago || '')) pago = 'PayPal';
    const dest = clave(f[10]);
    if (dest && !DESTINO_DE[dest]) warn(`Gasto fila ${i + 1}: destino desconocido "${txt(f[10])}"`);
    tablas.gastos.push({
      numero: txt(f[1]), fecha: fe, concepto_id: ref('conceptos_gasto', conceptos.de(f[3])), cantidad: cant,
      factura_a_id: ref('entidades', ent(f[5], 'gasto.factura a')), empresa_real_id: ref('entidades', ent(f[6], 'gasto.empresa real')),
      proveedor_id: ref('proveedores', proveedores.de(f[7])), num_factura: txt(f[8]), aplicacion: aplic,
      destino: DESTINO_DE[dest] ?? null, importante: si(f[11]), importe: importe ?? 0, iva_pct: iva, total: total ?? 0,
      fecha_pago: fecha(f[15]), modalidad_pago: modalidades.de(pago), pagado_por_id: ref('entidades', ent(f[18], 'gasto.pagado por')),
    });
    s.importadas++;
  }

  // ===== Ingresos =====
  const hi = hojas['Ingresos 2026'] || [];
  tablas.ingresos = [];
  for (let i = 3; i < hi.length; i++) {
    const f = hi[i];
    const fe = fecha(f?.[2]);
    if (!fe) continue;
    const s = stat('ingresos');
    s.leidas++;
    if (esGanaderia(f[4], f[5], f[6], f[7], f[15])) { s.ganaderia++; continue; }
    const iva0 = num(f[12]) ?? 0;
    const compr = compradores.de(f[15]);
    tablas.ingresos.push({
      numero: txt(f[1]), fecha: fe, campania: txt(f[3]), producto: txt(f[4]), tipo: txt(f[5]),
      empresa_id: ref('entidades', ent(f[6], 'ingreso.empresa')), agricultor_id: ref('entidades', ent(f[7], 'ingreso.agricultor')),
      kilos: num(f[8]), precio_kg: num(f[9]), base: num(f[10]) ?? 0, retencion: num(f[11]) ?? 0,
      iva_pct: iva0 > 0 && iva0 < 1 ? iva0 * 100 : iva0, total: num(f[13]) ?? 0, importante: si(f[14]),
      comprador_id: ref('compradores', compr), fecha_cobro: fecha(f[17]), banco: txt(f[18]),
      _cif: txt(f[16]),
    });
    s.importadas++;
  }

  // ===== Cosechas =====
  const hc = hojas['Cosechas 2026'] || [];
  tablas.cosechas = [];
  for (let i = 2; i < hc.length; i++) {
    const f = hc[i];
    const fe = fecha(f?.[1]);
    const cultivo = txt(f?.[4]);
    if (!fe || !['blanca', 'tinta', 'olivos', 'almendros'].includes(clave(cultivo))) continue;
    const s = stat('cosechas');
    s.leidas++;
    if (esGanaderia(f[3], f[6], f[7])) { s.ganaderia++; continue; }
    const conc = { 'grado:': 'Grado', 'rdto:': 'Rdto', 'tamano:': 'Tamaño' }[clave(f[10])] ?? null;
    tablas.cosechas.push({
      fecha: fe, trabajadores: num(f[2]), finca_id: ref('fincas', fincaDe(f[3], 'cosecha')), cultivo,
      lote_id: ref('entidades', ent(f[6], 'cosecha.lote')), tipo: txt(f[7]),
      kilos_netos: num(f[8]), kilos_limpios: num(f[9]), concepto: conc, valor: num(f[11]),
    });
    s.importadas++;
  }

  // ===== Movimientos de cuentas (bloques de 5 columnas) =====
  const hcu = hojas['CUENTAS COOPE'] || [];
  const BLOQUES = [['Hermanos Bueno', 0], ['Agrobueno', 5], ['Antonio', 10], ['Cati', 15], ['Felipe', 20], ['FBF', 25]];
  tablas.movimientos_cuenta = [];
  for (const [cuenta, off] of BLOQUES) {
    let primera = true, saldo = 0;
    for (let i = 3; i < hcu.length; i++) {
      const f = hcu[i] || [];
      const fe = fecha(f[off], false);
      const conc = txt(f[off + 1]);
      if (!fe || !conc) continue;
      const s = stat('movimientos_cuenta');
      s.leidas++;
      let cargo = num(f[off + 2]) ?? 0, ingreso = num(f[off + 3]) ?? 0;
      const sal = num(f[off + 4]);
      if (primera && !cargo && !ingreso && sal) { if (sal >= 0) ingreso = sal; else cargo = -sal; }
      primera = false;
      saldo = Math.round((saldo + ingreso - cargo) * 100) / 100;
      if (sal != null && Math.abs(sal - saldo) > 0.05) { warn(`Cuenta ${cuenta} fila ${i + 1}: saldo del Excel ${sal} ≠ calculado ${saldo}`); saldo = sal; }
      tablas.movimientos_cuenta.push({ cuenta_id: ref('cuentas', cuenta), fecha: fe, concepto: conc, cargo, ingreso });
      s.importadas++;
    }
  }

  // ===== Inventario =====
  const hinv = hojas['INVENTARIO'] || [];
  tablas.inventario = [];
  for (let i = 1; i < hinv.length; i++) {
    const f = hinv[i];
    const prod = txt(f?.[0]);
    if (!prod) continue;
    const s = stat('inventario');
    s.leidas++;
    if (esGanaderia(f[5], f[6], prod)) { s.ganaderia++; continue; }
    const fc = fecha(f[3]);
    const notas = !fc && txt(f[3]) ? `Fecha de compra original: ${txt(f[3])}` : null;
    tablas.inventario.push({
      producto: prod, matricula: txt(f[1]), unidades: entero(f[2]) ?? 1, fecha_compra: fc, n_chasis: txt(f[4]),
      destino: clave(f[5]) === 'cerales' ? 'Cereales' : txt(f[5]), propiedad: txt(f[6]),
      fecha_primera_matricula: fecha(f[7]), situacion: txt(f[8]), notas,
    });
    s.importadas++;
  }

  // ===== Correspondencia =====
  const hco = hojas['Correspondencia 2026'] || [];
  tablas.correspondencia = [];
  for (let i = 2; i < hco.length; i++) {
    const f = hco[i];
    const fe = fecha(f?.[1]);
    const sentido = { entrada: 'Entrada', salida: 'Salida' }[clave(f?.[2])];
    if (!fe || !sentido) continue;
    const s = stat('correspondencia');
    s.leidas++;
    if (esGanaderia(f[3], f[4], f[7])) { s.ganaderia++; continue; }
    tablas.correspondencia.push({
      codigo: txt(f[0]), fecha: fe, sentido, remitente_destinatario: txt(f[3]), afecta_a: afectaA.de(f[4]),
      referencia: refs.de(f[5]), importante: si(f[6]), contenido: txt(f[7]),
    });
    s.importadas++;
  }

  // ===== Catálogos (derivados) =====
  const catalogos = {
    tareas: tareas.valores, proveedores: proveedores.valores, conceptos_gasto: conceptos.valores,
    compradores: compradores.valores,
  };
  const cifs = {};
  for (const r of tablas.ingresos) if (r._cif && r.comprador_id) cifs[r.comprador_id.nombre] = r._cif;
  for (const r of tablas.ingresos) delete r._cif;

  // coherencias
  let descuadre = 0;
  for (const g of tablas.gastos) if (Math.abs(g.importe * (1 + g.iva_pct / 100) * g.cantidad - g.total) > 0.05) descuadre++;
  if (descuadre) warn(`${descuadre} gastos donde importe + IVA ≠ total (se conserva el total del Excel)`);
  if (desconocidos.size) warn('Nombres no reconocidos (quedan vacíos): ' + [...desconocidos].slice(0, 15).join('; '));

  return { tablas, catalogos, cifs, resumen, avisos };
}
