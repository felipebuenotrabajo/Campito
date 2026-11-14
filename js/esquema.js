// Definición declarativa de cada pantalla: columnas, formularios, filtros y totales.
// Para añadir un campo nuevo a una pantalla basta con añadirlo aquí (y a la tabla en Supabase).
import { eur, numf, redondea, fechaf } from './util.js';
import { enlaceVisor, hayCodigo as hayCodigoSigpac, codMunicipio, listaRecintos } from './sigpac.js';

export const TAJOS = ['Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Cereales', 'Día de orden', 'Casa'];
export const DESTINOS = ['Todos', 'Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Cereales', 'Casa', 'A cuenta', 'Her'];
const SI_NO = ['SI', 'NO', 'SOLICITADO'];

// Iconos (trazos de 24px)
export const ICONOS = {
  resumen: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  notas: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 13h8 M8 17h5',
  diario: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',
  gastos: 'M18 6.5A7 7 0 1 0 18 17.5 M4 10h9 M4 14h9',
  ingresos: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  cosechas: 'M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 17-9 17z M4 21c2-6 5-9 9-11',
  parcelas: 'M9 3L3 5v16l6-2 6 2 6-2V3l-6 2z M9 3v16 M15 5v16',
  fincas: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  cuentas: 'M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18',
  inventario: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  correspondencia: 'M3 6h18v12H3z M3 7l9 7 9-7',
  catalogo: 'M4 6h16 M4 12h16 M4 18h10',
  importar: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
  miembros: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M17 11a3 3 0 1 0 0-6 M21 19v-1a4 4 0 0 0-3-3.9',
  mas: 'M5 12h.01 M12 12h.01 M19 12h.01',
};

// ---------- helpers de columnas ----------
const c = (k, label, tipo = 'texto', o = {}) => ({ k, label, tipo, ...o });
const fk = (k, label, cat, o = {}) => c(k, label, 'fk', { cat, ...o });

export const ENTIDADES = {
  // ============ DIARIO DE TRABAJO ============
  diario_trabajo: {
    titulo: 'Diario de trabajo', singular: 'jornada', grupo: 'principal', icono: 'diario', orden: [['fecha', false], ['id', false]],
    fechaCol: 'fecha',
    cols: [
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      c('tajo', 'Tajo', 'select', { lista: true, req: true, opciones: TAJOS }),
      fk('finca_id', 'Finca', 'fincas', { lista: true }),
      fk('tarea_id', 'Tarea', 'tareas', { lista: true, nuevo: true }),
      c('trabajadores', 'Nº trabajadores', 'num', { lista: true, req: true, def: 1 }),
      c('horas_por_peon', 'Horas por peón', 'num'),
      c('horas', 'Horas totales', 'num', { req: true, lista: true }),
      c('precio_jornal', 'Precio del jornal (€)', 'num', { req: true }),
      fk('pagado_por_id', 'Pagado por', 'entidades'),
      c('notas', 'Notas', 'area'),
      c('_jornales', 'Jornales', 'num', { calc: (r, x) => r.horas / x.ajustes.horas_por_jornal, lista: true, soloLista: true }),
      c('_coste', 'Coste', 'eur', { calc: (r, x) => (r.horas / x.ajustes.horas_por_jornal) * r.precio_jornal, lista: true, soloLista: true }),
    ],
    filtros: [c('tajo', 'Tajo', 'select', { opciones: TAJOS }), fk('finca_id', 'Finca', 'fincas'), fk('tarea_id', 'Tarea', 'tareas')],
    totales: [{ k: '_jornales', label: 'Jornales', tipo: 'num' }, { k: '_coste', label: 'Coste', tipo: 'eur' }],
    auto: [{ campo: 'horas', desde: ['trabajadores', 'horas_por_peon'], fn: (v) => (v.trabajadores && v.horas_por_peon ? redondea(v.trabajadores * v.horas_por_peon, 3) : null) }],
    defaults: (x) => ({ precio_jornal: x.ajustes.precio_jornal, trabajadores: 1, horas_por_peon: 6 }),
    tarjeta: {
      t: (r, x) => `${x.nombre('tareas', r.tarea_id) || r.tajo}${r.finca_id ? ' · ' + x.nombre('fincas', r.finca_id) : ''}`,
      s: (r) => `${r.tajo} · ${numf(r.trabajadores)} trab. · ${numf(r.horas)} h`, v: (r) => r._coste, vt: 'eur',
    },
  },

  // ============ GASTOS ============
  gastos: {
    titulo: 'Gastos', singular: 'gasto', grupo: 'principal', icono: 'gastos', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      c('numero', 'Nº de gasto', 'texto'),
      fk('proveedor_id', 'Proveedor', 'proveedores', { lista: true, nuevo: true }),
      fk('concepto_id', 'Concepto', 'conceptos_gasto', { lista: true, nuevo: true }),
      c('aplicacion', 'Aplicación / detalle', 'texto', { lista: true }),
      c('destino', 'Destino', 'select', { lista: true, opciones: DESTINOS }),
      c('cantidad', 'Cantidad', 'num', { def: 1 }),
      c('importe', 'Importe unitario sin IVA (€)', 'num', { req: true }),
      c('iva_pct', 'IVA (%)', 'num', { def: 21, sugerencias: [0, 4, 10, 12, 21] }),
      c('total', 'Total con IVA (€)', 'eur', { req: true, lista: true }),
      fk('empresa_real_id', 'A cargo de (quién lo debe)', 'entidades', { lista: true }),
      c('es_personal', 'Gasto personal (no se reparte)', 'bool', { ayuda: 'Marcado: va entero a la persona indicada. Sin marcar y a cargo de FBF o de una sociedad: se reparte entre los socios por hectáreas.' }),
      fk('factura_a_id', 'Factura a nombre de', 'entidades'),
      fk('pagado_por_id', 'Pagado por', 'entidades'),
      c('modalidad_pago', 'Forma de pago', 'texto', { sugerencias: ['Caja Rural de Extremadura', 'Cooperativa', 'Efectivo', 'Caja Almendralejo', 'Tarjeta Caja Rural', 'Bizum'] }),
      c('fecha_pago', 'Fecha de pago', 'fecha'),
      c('num_factura', 'Nº de factura', 'texto'),
      c('importante', 'Importante', 'bool'),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [c('destino', 'Destino', 'select', { opciones: DESTINOS }), fk('concepto_id', 'Concepto', 'conceptos_gasto'), fk('empresa_real_id', 'A cargo de', 'entidades'), fk('proveedor_id', 'Proveedor', 'proveedores')],
    totales: [{ k: 'total', label: 'Total', tipo: 'eur' }],
    auto: [{ campo: 'total', desde: ['importe', 'iva_pct', 'cantidad'], fn: (v) => (v.importe != null ? redondea(v.importe * (1 + (v.iva_pct || 0) / 100) * (v.cantidad ?? 1), 2) : null) }],
    numeracion: { campo: 'numero', prefijo: (yy) => `${yy}-` },
    defaults: () => ({ cantidad: 1, iva_pct: 21 }),
    tarjeta: {
      t: (r, x) => x.nombre('proveedores', r.proveedor_id) || x.nombre('conceptos_gasto', r.concepto_id) || 'Gasto',
      s: (r, x) => [x.nombre('conceptos_gasto', r.concepto_id), r.aplicacion, r.destino].filter(Boolean).join(' · '), v: (r) => r.total, vt: 'eur',
    },
  },

  // ============ INGRESOS ============
  ingresos: {
    titulo: 'Ingresos', singular: 'ingreso', grupo: 'principal', icono: 'ingresos', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      c('numero', 'Nº de ingreso', 'texto', { lista: true }),
      c('campania', 'Campaña', 'texto', { sugerencias: ['2026', '2025', '2024/25'] }),
      c('producto', 'Producto', 'texto', { sugerencias: ['Viñas', 'Olivos', 'Almendros', 'Barbechos', 'Pac', 'Sub Gasoil', 'Sub Abonos'] }),
      c('tipo', 'Tipo', 'texto', { lista: true, sugerencias: ['Blanca', 'Tinto', 'Almazara', 'Aderezo', 'Almendras', 'Pac', 'Sub'] }),
      fk('comprador_id', 'Comprador', 'compradores', { lista: true, nuevo: true }),
      fk('empresa_id', 'Factura a nombre de', 'entidades'),
      fk('agricultor_id', 'Agricultor', 'entidades', { lista: true }),
      c('kilos', 'Kilos', 'num', { lista: true }),
      c('precio_kg', 'Precio por kg (€)', 'num'),
      c('base', 'Base imponible (€)', 'num', { req: true }),
      c('iva_pct', 'IVA / compensación (%)', 'num', { def: 12, sugerencias: [0, 10, 12, 21] }),
      c('retencion', 'Retención (€)', 'num'),
      c('total', 'Total (€)', 'eur', { req: true, lista: true }),
      c('fecha_cobro', 'Fecha de cobro', 'fecha'),
      c('banco', 'Banco', 'texto', { sugerencias: ['Cooperativa', 'Caja Rural de Extremadura', 'Caja Almendralejo'] }),
      c('importante', 'Importante', 'bool'),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [fk('agricultor_id', 'Agricultor', 'entidades'), fk('comprador_id', 'Comprador', 'compradores'), c('tipo', 'Tipo', 'texto')],
    totales: [{ k: 'kilos', label: 'Kilos', tipo: 'num' }, { k: 'total', label: 'Total', tipo: 'eur' }],
    auto: [{ campo: 'total', desde: ['base', 'iva_pct', 'retencion'], fn: (v) => (v.base != null ? redondea(v.base * (1 + (v.iva_pct || 0) / 100) - (v.retencion || 0), 2) : null) }],
    numeracion: { campo: 'numero', prefijo: (yy) => `I${yy}-` },
    defaults: () => ({ iva_pct: 12 }),
    tarjeta: {
      t: (r, x) => x.nombre('compradores', r.comprador_id) || r.tipo || 'Ingreso',
      s: (r, x) => [r.numero, r.tipo, x.nombre('entidades', r.agricultor_id), r.kilos ? numf(r.kilos, 0) + ' kg' : null].filter(Boolean).join(' · '), v: (r) => r.total, vt: 'eur',
    },
  },

  // ============ COSECHAS ============
  cosechas: {
    titulo: 'Cosechas', singular: 'entrega de cosecha', grupo: 'principal', icono: 'cosechas', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      fk('finca_id', 'Finca', 'fincas', { lista: true }),
      c('cultivo', 'Cultivo', 'select', { opciones: ['Blanca', 'Tinta', 'Olivos', 'Almendros'], lista: true, req: true }),
      c('tipo', 'Tipo / variedad', 'texto', { lista: true, sugerencias: ['Blanca', 'Tinta', 'Aderezo', 'Guara', 'Lauranne'] }),
      fk('lote_id', 'Lote (a quién se imputa)', 'entidades', { lista: true }),
      c('kilos_netos', 'Kilos netos', 'num', { lista: true }),
      c('kilos_limpios', 'Kilos limpios', 'num'),
      c('concepto', 'Medida', 'select', { opciones: ['Grado', 'Rdto', 'Tamaño'] }),
      c('valor', 'Grados / rendimiento / tamaño', 'num', { lista: true }),
      c('trabajadores', 'Nº trabajadores', 'num'),
      c('notas', 'Notas', 'area'),
      c('_kg_grado', 'Kg × grado', 'num', { calc: (r) => (r.concepto === 'Grado' && r.kilos_limpios ? r.kilos_limpios * r.valor : null), soloLista: true }),
    ],
    filtros: [c('cultivo', 'Cultivo', 'select', { opciones: ['Blanca', 'Tinta', 'Olivos', 'Almendros'] }), fk('finca_id', 'Finca', 'fincas'), fk('lote_id', 'Lote', 'entidades')],
    totales: [{ k: 'kilos_netos', label: 'Kilos netos', tipo: 'num' }],
    defaults: () => ({}),
    tarjeta: { t: (r, x) => x.nombre('fincas', r.finca_id) || r.cultivo, s: (r, x) => [r.tipo, x.nombre('entidades', r.lote_id), r.concepto ? `${r.concepto} ${numf(r.valor)}` : null].filter(Boolean).join(' · '), v: (r) => r.kilos_netos, vt: 'kg' },
  },

  // ============ PARCELAS ============
  parcelas: {
    titulo: 'Parcelas', singular: 'parcela', grupo: 'terreno', icono: 'parcelas', orden: [['nombre', true], ['poligono', true]],
    cols: [
      c('nombre', 'Nombre', 'texto', { lista: true, req: true, grupo: 'Identificación' }),
      fk('finca_id', 'Finca de trabajo', 'fincas', { lista: true }),
      c('codigo', 'Nº interno', 'int'),
      c('poligono', 'Polígono', 'texto', { lista: true }),
      c('parcela', 'Parcela', 'texto', { lista: true }),
      c('recinto', 'Recinto', 'texto'),
      c('termino', 'Término municipal', 'texto', { lista: true, sugerencias: ['VILLALBA BARROS', 'SANTA MARTA', 'FUENTE MAESTRE', 'ACEUCHAL'] }),
      c('ref_catastral', 'Referencia catastral', 'texto', { lista: true, ayuda: 'Se usa para abrir la parcela en la Sede del Catastro' }),
      c('latitud', 'Latitud', 'num', { ayuda: 'Coordenadas de Google Maps (Visor SIGPAC)' }),
      c('longitud', 'Longitud', 'num'),
      c('region', 'Región', 'texto'),
      c('ha_sigpac', 'Ha SIGPAC', 'num', { grupo: 'Superficie' }),
      c('ha_otros_recintos', 'Ha otros recintos', 'num'),
      c('ha_total', 'Ha totales', 'num', { lista: true, soloLista: true }),
      c('fanegas', 'Fanegas', 'num', { soloLista: true }),
      c('pendiente', 'Pendiente (%)', 'num'),
      fk('cultivo_id', 'Cultivo', 'cultivos', { lista: true, grupo: 'Cultivo' }),
      c('variedad', 'Variedad', 'texto', { lista: true }),
      c('anio_plantacion', 'Año de plantación', 'int'),
      c('n_olivos_do', 'Nº olivos DO', 'int'),
      fk('explotacion_id', 'Explotación', 'entidades', { lista: true, grupo: 'Titularidad' }),
      fk('lote_id', 'Lote', 'entidades', { lista: true }),
      c('propietario', 'Propietario', 'texto'),
      c('titular_catastro', 'Titular en catastro', 'texto'),
      c('reg_viticola', 'Registro vitícola', 'texto'),
      c('n_parcela_registral', 'Nº parcela registral', 'texto'),
      c('lic_zepa', 'LIC / ZEPA', 'texto', { grupo: 'Normativa y ayudas' }),
      c('nitratos', 'Nitratos', 'texto'),
      c('agroambientales', 'Agroambientales', 'texto'),
      c('tasacion_reparto', 'Tasación para reparto (€)', 'num'),
      c('comunidad_regantes', 'Comunidad de regantes', 'texto', { grupo: 'Riego', sugerencias: SI_NO }),
      c('toma_agua', 'Toma de agua', 'texto'),
      c('expediente_riego', 'Expediente de riego', 'texto'),
      c('activa', 'Activa', 'bool', { def: true, grupo: 'Otros' }),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [c('termino', 'Término', 'select', { opciones: ['VILLALBA BARROS', 'SANTA MARTA', 'FUENTE MAESTRE', 'ACEUCHAL'] }), fk('cultivo_id', 'Cultivo', 'cultivos'), fk('explotacion_id', 'Explotación', 'entidades'), fk('lote_id', 'Lote', 'entidades'), fk('finca_id', 'Finca', 'fincas')],
    sigpac: true,
    vista: true,
    enlaces: (r) => {
      const rc = (r.ref_catastral || '').replace(/\s/g, '').toUpperCase();
      const movil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      const cod = hayCodigoSigpac(r) ? `Prov 6 · Mun ${codMunicipio(r)} · Agg 0 · Zona 0 · Pol ${parseInt(r.poligono, 10)} · Parc ${parseInt(r.parcela, 10)}${listaRecintos(r.recinto)[0] ? ` · Rec ${listaRecintos(r.recinto)[0]}` : ''}` : [r.termino, r.poligono && `Pol. ${r.poligono}`, r.parcela && `Parc. ${r.parcela}`].filter(Boolean).join(' · ');
      const ident = cod;
      return {
        nota: ident ? (movil ? `En el móvil el visor SIGPAC no abre la parcela directamente: usa su buscador por referencia con ${ident}` : `Datos SIGPAC: ${ident}`) : '',
        links: [
          r.latitud != null && r.longitud != null ? { t: 'Ver en Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${r.latitud}%2C${r.longitud}` } : null,
          { t: 'Ver en visor SIGPAC', href: enlaceVisor(r) },
          rc.length >= 14 ? { t: 'Ver en Catastro', href: `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${rc.slice(0, 14)}` } : null,
        ].filter(Boolean),
      };
    },
    totales: [{ k: 'ha_total', label: 'Hectáreas', tipo: 'num' }],
    defaults: () => ({ activa: true }),
    tarjeta: { t: (r) => r.nombre, s: (r, x) => [x.nombre('cultivos', r.cultivo_id), r.variedad, `Pol. ${r.poligono ?? '-'} · Par. ${r.parcela ?? '-'}`].filter(Boolean).join(' · '), v: (r) => r.ha_total, vt: 'ha' },
  },

  // ============ FINCAS ============
  fincas: {
    titulo: 'Fincas', singular: 'finca', grupo: 'terreno', icono: 'fincas', orden: [['nombre', true]],
    cols: [
      c('nombre', 'Nombre', 'texto', { lista: true, req: true }),
      fk('cultivo_id', 'Cultivo', 'cultivos', { lista: true }),
      fk('explotacion_id', 'Explotación', 'entidades', { lista: true }),
      fk('lote_id', 'Lote', 'entidades', { lista: true }),
      c('activa', 'Activa', 'bool', { def: true }),
      c('notas', 'Notas', 'area'),
      c('_ha', 'Hectáreas', 'num', { calc: (r, x) => x.cat.parcelas.filter((p) => p.finca_id === r.id).reduce((s, p) => s + (Number(p.ha_total) || 0), 0), lista: true, soloLista: true }),
      c('_np', 'Parcelas', 'int', { calc: (r, x) => x.cat.parcelas.filter((p) => p.finca_id === r.id).length, lista: true, soloLista: true }),
    ],
    filtros: [fk('cultivo_id', 'Cultivo', 'cultivos'), fk('explotacion_id', 'Explotación', 'entidades'), fk('lote_id', 'Lote', 'entidades')],
    totales: [{ k: '_ha', label: 'Hectáreas', tipo: 'num' }],
    defaults: () => ({ activa: true }),
    tarjeta: { t: (r) => r.nombre, s: (r, x) => [x.nombre('cultivos', r.cultivo_id), x.nombre('entidades', r.explotacion_id), x.nombre('entidades', r.lote_id)].filter(Boolean).join(' · '), v: (r) => r._ha, vt: 'ha' },
  },

  // ============ CUENTAS ============
  movimientos_cuenta: {
    titulo: 'Movimientos de cuentas', singular: 'movimiento', grupo: 'otros', icono: 'cuentas', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      fk('cuenta_id', 'Cuenta', 'cuentas', { lista: true, req: true }),
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      c('concepto', 'Concepto', 'texto', { lista: true, req: true }),
      c('cargo', 'Cargo (€)', 'eur', { lista: true }),
      c('ingreso', 'Ingreso (€)', 'eur', { lista: true }),
      c('_saldo', 'Saldo', 'eur', { soloLista: true, lista: true }),
    ],
    filtros: [fk('cuenta_id', 'Cuenta', 'cuentas')],
    totales: [{ k: 'cargo', label: 'Cargos', tipo: 'eur' }, { k: 'ingreso', label: 'Ingresos', tipo: 'eur' }],
    // saldo acumulado por cuenta (en orden cronológico)
    derivar: (rows) => {
      const orden = [...rows].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
      const acc = {};
      for (const r of orden) { acc[r.cuenta_id] = redondea((acc[r.cuenta_id] || 0) + (Number(r.ingreso) || 0) - (Number(r.cargo) || 0), 2); r._saldo = acc[r.cuenta_id]; }
    },
    defaults: () => ({ cargo: 0, ingreso: 0 }),
    tarjeta: { t: (r) => r.concepto, s: (r, x) => `${x.nombre('cuentas', r.cuenta_id)} · saldo ${eur(r._saldo)}`, v: (r) => (Number(r.ingreso) || 0) - (Number(r.cargo) || 0), vt: 'eur' },
  },

  // ============ INVENTARIO ============
  inventario: {
    titulo: 'Inventario', singular: 'elemento', grupo: 'otros', icono: 'inventario', orden: [['producto', true]],
    cols: [
      c('producto', 'Producto', 'texto', { lista: true, req: true }),
      c('matricula', 'Matrícula', 'texto', { lista: true }),
      c('unidades', 'Unidades', 'int', { lista: true, def: 1 }),
      c('fecha_compra', 'Fecha de compra', 'fecha', { lista: true }),
      c('n_chasis', 'Nº de chasis', 'texto'),
      c('destino', 'Destino', 'texto', { lista: true, sugerencias: ['General', 'Olivos', 'Viñas', 'Almendros', 'Cereales'] }),
      c('propiedad', 'Propiedad', 'texto', { lista: true, sugerencias: ['Hermanos Bueno', 'Agrobueno'] }),
      c('fecha_primera_matricula', 'Fecha 1ª matriculación', 'fecha'),
      c('situacion', 'Situación', 'texto', { sugerencias: ['BAJA'] }),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [c('destino', 'Destino', 'texto'), c('propiedad', 'Propiedad', 'texto')],
    defaults: () => ({ unidades: 1 }),
    tarjeta: { t: (r) => r.producto, s: (r) => [r.matricula, r.propiedad, r.destino].filter(Boolean).join(' · '), v: (r) => r.unidades, vt: 'ud' },
  },

  // ============ CORRESPONDENCIA ============
  correspondencia: {
    titulo: 'Correspondencia', singular: 'carta o documento', grupo: 'otros', icono: 'correspondencia', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      c('codigo', 'Código', 'texto', { lista: true }),
      c('fecha', 'Fecha', 'fecha', { lista: true, req: true }),
      c('sentido', 'Entrada / Salida', 'select', { opciones: ['Entrada', 'Salida'], lista: true, req: true }),
      c('remitente_destinatario', 'Remitente / destinatario', 'texto', { lista: true }),
      c('afecta_a', 'Afecta a', 'texto', { lista: true, sugerencias: ['Hermanos Bueno', 'Agrobueno', 'FBF', 'Antonio', 'Pepe', 'Cati', 'Felipe', 'Ada', 'Todos'] }),
      c('referencia', 'Tipo de documento', 'texto', { sugerencias: ['Notificación', 'Resolución', 'Solicitud', 'Contrato', 'Embargo', 'Presupuesto', 'Requerimiento'] }),
      c('importante', 'Importante', 'bool'),
      c('contenido', 'Contenido', 'area', { lista: true }),
    ],
    filtros: [c('sentido', 'Entrada / Salida', 'select', { opciones: ['Entrada', 'Salida'] }), c('afecta_a', 'Afecta a', 'texto'), c('referencia', 'Tipo', 'texto')],
    numeracion: { campo: 'codigo', prefijo: (yy) => `C${yy}-` },
    defaults: () => ({ sentido: 'Entrada' }),
    tarjeta: { t: (r) => r.remitente_destinatario || r.codigo, s: (r) => [r.codigo, r.sentido, r.referencia, r.contenido].filter(Boolean).join(' · '), v: () => null },
  },

  // ============ CATÁLOGOS ============
  proveedores: {
    titulo: 'Proveedores', singular: 'proveedor', grupo: 'datos', icono: 'catalogo', orden: [['nombre', true]],
    cols: [c('nombre', 'Nombre', 'texto', { lista: true, req: true }), c('nif', 'NIF', 'texto', { lista: true }), c('notas', 'Notas', 'area', { lista: true })],
    defaults: () => ({}), tarjeta: { t: (r) => r.nombre, s: (r) => r.nif || '', v: () => null },
  },
  compradores: {
    titulo: 'Compradores', singular: 'comprador', grupo: 'datos', icono: 'catalogo', orden: [['nombre', true]],
    cols: [c('nombre', 'Nombre', 'texto', { lista: true, req: true }), c('cif', 'CIF', 'texto', { lista: true }), c('notas', 'Notas', 'area', { lista: true })],
    defaults: () => ({}), tarjeta: { t: (r) => r.nombre, s: (r) => r.cif || '', v: () => null },
  },
  tareas: {
    titulo: 'Tareas', singular: 'tarea', grupo: 'datos', icono: 'catalogo', orden: [['nombre', true]],
    cols: [c('nombre', 'Nombre', 'texto', { lista: true, req: true }), c('activa', 'Activa', 'bool', { def: true, lista: true })],
    defaults: () => ({ activa: true }), tarjeta: { t: (r) => r.nombre, s: (r) => (r.activa ? '' : 'Inactiva'), v: () => null },
  },
  conceptos_gasto: {
    titulo: 'Conceptos de gasto', singular: 'concepto', grupo: 'datos', icono: 'catalogo', orden: [['nombre', true]],
    cols: [c('nombre', 'Nombre', 'texto', { lista: true, req: true })],
    defaults: () => ({}), tarjeta: { t: (r) => r.nombre, s: () => '', v: () => null },
  },
  entidades: {
    titulo: 'Socios y sociedades', singular: 'socio', grupo: 'datos', icono: 'miembros', orden: [['orden', true]],
    cols: [
      c('nombre', 'Nombre corto', 'texto', { lista: true, req: true }),
      c('nombre_completo', 'Nombre completo', 'texto', { lista: true }),
      c('tipo', 'Tipo', 'select', { opciones: ['persona', 'sociedad', 'comun'], lista: true, req: true }),
      c('orden', 'Orden', 'int', { def: 0 }),
      c('activa', 'Activa', 'bool', { def: true, lista: true }),
    ],
    defaults: () => ({ activa: true, tipo: 'persona', orden: 0 }), tarjeta: { t: (r) => r.nombre, s: (r) => `${r.tipo}${r.nombre_completo ? ' · ' + r.nombre_completo : ''}`, v: () => null },
  },
  cuentas: {
    titulo: 'Cuentas bancarias', singular: 'cuenta', grupo: 'datos', icono: 'cuentas', orden: [['nombre', true]],
    cols: [c('nombre', 'Nombre', 'texto', { lista: true, req: true }), fk('entidad_id', 'Titular', 'entidades', { lista: true }), c('banco', 'Banco', 'texto', { lista: true }), c('referencia', 'Últimos dígitos', 'texto', { lista: true })],
    defaults: () => ({ banco: 'Cooperativa' }), tarjeta: { t: (r) => r.nombre, s: (r, x) => `${r.banco ?? ''} ${r.referencia ?? ''}`, v: () => null },
  },

  // ============ MIEMBROS (solo admin) ============
  miembros: {
    titulo: 'Miembros con acceso', singular: 'miembro', grupo: 'admin', icono: 'miembros', pk: 'email', orden: [['email', true]], soloAdmin: true,
    cols: [
      c('email', 'Correo electrónico', 'texto', { lista: true, req: true }),
      c('nombre', 'Nombre', 'texto', { lista: true }),
      c('rol', 'Rol', 'select', { opciones: ['admin', 'editor', 'lector'], lista: true, req: true, ayuda: 'admin: todo · editor: añade y modifica · lector: solo consulta' }),
    ],
    defaults: () => ({ rol: 'editor' }), tarjeta: { t: (r) => r.email, s: (r) => `${r.nombre ?? ''} · ${r.rol}`, v: () => null },
  },

  // ============ HOJAS RESTANTES DEL EXCEL ============
  maquinaria: {
    titulo: 'Compras de maquinaria', singular: 'compra', grupo: 'otros', icono: 'inventario', orden: [['equipo', true]],
    cols: [
      c('equipo', 'Equipo', 'texto', { lista: true, req: true }),
      fk('pagado_por_id', 'La paga', 'entidades', { lista: true, req: true }),
      c('referencia', 'Nº de gasto o nota', 'texto', { lista: true, ayuda: 'Año-número del gasto (p. ej. 26-227) o una nota' }),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [fk('pagado_por_id', 'La paga', 'entidades')],
    tarjeta: { t: (r) => r.equipo, s: (r, x) => [x.nombre('entidades', r.pagado_por_id), r.referencia].filter(Boolean).join(' · '), v: () => null },
  },
  cabidas: {
    titulo: 'Cabidas (cooperativa)', singular: 'saldo', grupo: 'otros', icono: 'cuentas', orden: [['producto', true], ['id', true]],
    cols: [
      fk('socio_id', 'Socio', 'entidades', { lista: true, req: true }),
      c('producto', 'Producto', 'select', { lista: true, req: true, opciones: ['Aderezo', 'Almazara', 'Blanca', 'Tinta'] }),
      c('fecha', 'Fecha', 'fecha', { lista: true }),
      c('kg', 'Kg entregados', 'num', { lista: true }),
      c('valor', 'Valor (€)', 'eur', { lista: true }),
      c('pendiente', 'Pendiente de cobro (€)', 'eur', { lista: true }),
      c('kg_cabida', 'Kg de cabida en la cooperativa', 'num', { lista: true }),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [fk('socio_id', 'Socio', 'entidades'), c('producto', 'Producto', 'select', { opciones: ['Aderezo', 'Almazara', 'Blanca', 'Tinta'] })],
    totales: [{ k: 'kg', label: 'Kg', tipo: 'num' }, { k: 'valor', label: 'Valor', tipo: 'eur' }, { k: 'pendiente', label: 'Pendiente', tipo: 'eur' }],
    tarjeta: { t: (r, x) => `${x.nombre('entidades', r.socio_id)} · ${r.producto}`, s: (r) => [r.kg != null ? `${numf(r.kg, 0)} kg` : '', r.pendiente ? `pendiente ${eur(r.pendiente)}` : ''].filter(Boolean).join(' · '), v: (r) => r.valor, vt: 'eur' },
  },
  titulos_cooperativa: {
    titulo: 'Títulos de la cooperativa', singular: 'título', grupo: 'otros', icono: 'cuentas', orden: [['fecha', true], ['id', true]],
    cols: [
      fk('titular_id', 'Titular', 'entidades', { lista: true, req: true }),
      c('titulos', 'Nº de títulos', 'int', { lista: true, req: true }),
      c('euros_titulo', '€ por título', 'eur', { lista: true }),
      c('capital', 'Capital (€)', 'eur', { lista: true }),
      c('fecha', 'Fecha', 'fecha', { lista: true }),
      c('pendientes', 'Títulos pendientes', 'int', { lista: true }),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [fk('titular_id', 'Titular', 'entidades')],
    totales: [{ k: 'titulos', label: 'Títulos', tipo: 'num' }, { k: 'capital', label: 'Capital', tipo: 'eur' }],
    tarjeta: { t: (r, x) => x.nombre('entidades', r.titular_id) || 'Títulos', s: (r) => `${r.titulos} títulos · ${fechaf(r.fecha)}`, v: (r) => r.capital, vt: 'eur' },
  },
  derechos_pac: {
    titulo: 'Derechos PAC', singular: 'derecho', grupo: 'terreno', icono: 'parcelas', orden: [['numero', true]],
    cols: [
      c('numero', 'Nº de derecho', 'int', { lista: true, req: true }),
      c('valor_2024', 'Valor 2024 (€)', 'eur', { lista: true }),
      c('valor_2025', 'Valor 2025 (€)', 'eur', { lista: true }),
      c('valor_2026', 'Valor 2026 (€)', 'eur', { lista: true }),
      c('valor_2027', 'Valor 2027 (€)', 'eur', { lista: true }),
      c('notas', 'Notas', 'area'),
    ],
    totales: [{ k: 'valor_2024', label: '2024', tipo: 'eur' }, { k: 'valor_2025', label: '2025', tipo: 'eur' }, { k: 'valor_2026', label: '2026', tipo: 'eur' }, { k: 'valor_2027', label: '2027', tipo: 'eur' }],
    tarjeta: { t: (r) => `Derecho nº ${r.numero}`, s: (r) => `2026: ${eur(r.valor_2026)} · 2027: ${eur(r.valor_2027)}`, v: (r) => r.valor_2026, vt: 'eur' },
  },
  movimientos_ada: {
    titulo: 'Cuentas de Ada', singular: 'movimiento', grupo: 'otros', icono: 'cuentas', orden: [['fecha', false], ['id', false]], fechaCol: 'fecha',
    cols: [
      c('tipo', 'Tipo', 'select', { lista: true, req: true, opciones: ['Deuda con Ada', 'Deuda de Ada', 'Pago a Ada'] }),
      c('concepto', 'Concepto', 'texto', { lista: true, req: true }),
      c('fecha', 'Fecha', 'fecha', { lista: true }),
      c('referencia', 'Nº de ingreso o factura', 'texto'),
      c('importe', 'Importe (€)', 'eur', { lista: true, req: true }),
      c('banco', 'Banco o caja', 'texto'),
      c('notas', 'Notas', 'area'),
    ],
    filtros: [c('tipo', 'Tipo', 'select', { opciones: ['Deuda con Ada', 'Deuda de Ada', 'Pago a Ada'] })],
    totales: [{ k: 'importe', label: 'Importe', tipo: 'eur' }],
    defaults: () => ({ tipo: 'Deuda con Ada', importe: 0 }),
    tarjeta: { t: (r) => r.concepto, s: (r) => [r.tipo, fechaf(r.fecha)].filter(Boolean).join(' · '), v: (r) => r.importe, vt: 'eur' },
  },
};

// Menú
export const MENU = [
  { id: 'resumen', titulo: 'Resumen', icono: 'resumen', grupo: 'principal' },
  { id: 'personas', titulo: 'Por persona', icono: 'miembros', grupo: 'principal' },
  { id: 'produccion', titulo: 'Producción por finca', icono: 'cosechas', grupo: 'principal' },
  { id: 'semanas', titulo: 'Jornales por semana', icono: 'diario', grupo: 'principal' },
  { id: 'notas', titulo: 'Notas', icono: 'notas', grupo: 'otros' },
  { id: 'diario_trabajo' }, { id: 'gastos' }, { id: 'ingresos' }, { id: 'cosechas' },
  { id: 'parcelas' }, { id: 'fincas' },
  { id: 'movimientos_cuenta' }, { id: 'cabidas' }, { id: 'titulos_cooperativa' }, { id: 'movimientos_ada' }, { id: 'inventario' }, { id: 'maquinaria' }, { id: 'derechos_pac' }, { id: 'correspondencia' },
  { id: 'proveedores' }, { id: 'compradores' }, { id: 'tareas' }, { id: 'conceptos_gasto' }, { id: 'entidades' }, { id: 'cuentas' },
  { id: 'importar', titulo: 'Importar Excel', icono: 'importar', grupo: 'admin', soloAdmin: true },
  { id: 'miembros' },
];
export const GRUPOS = { principal: 'Campo', terreno: 'Terreno', otros: 'Gestión', datos: 'Listas y datos', admin: 'Administración' };

// cada pantalla se llama igual que su tabla en la base de datos
for (const [k, v] of Object.entries(ENTIDADES)) { v.id = k; v.tabla = k; }
