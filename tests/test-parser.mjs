// Uso: node tests/test-parser.mjs ruta/a/hojas.json   (el JSON sale del Excel real; NO se sube al repositorio)
import fs from 'node:fs';
import { analizar } from '../js/parser.js';
const hojas = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const r = analizar(hojas);
console.log('RESUMEN'); console.table(r.resumen);
console.log('Catálogos:', Object.fromEntries(Object.entries(r.catalogos).map(([k, v]) => [k, v.length])));
console.log('AVISOS:'); r.avisos.forEach((a) => console.log(' -', a));
for (const t of ['parcelas','diario_trabajo','gastos','ingresos','cosechas','movimientos_cuenta','inventario','correspondencia'])
  console.log(t, JSON.stringify(r.tablas[t][0]));
const suma = (a, k) => Math.round(a.reduce((s, x) => s + (x[k] || 0), 0) * 100) / 100;
console.log('Σ gastos total', suma(r.tablas.gastos, 'total'), '| Σ ingresos total', suma(r.tablas.ingresos, 'total'));
const horas = suma(r.tablas.diario_trabajo, 'horas'); console.log('Σ horas diario', horas, '→ jornales', horas / 6, '→ coste', Math.round(r.tablas.diario_trabajo.reduce((s,x)=>s+x.horas/6*x.precio_jornal,0)));
const sinFinca = r.tablas.parcelas.filter(p => !p.finca_id).length; console.log('parcelas sin finca:', sinFinca);
const porFinca = {}; r.tablas.parcelas.forEach(p => { if (p.finca_id) porFinca[p.finca_id.nombre] = (porFinca[p.finca_id.nombre]||0) + (p.ha_sigpac||0)+(p.ha_otros_recintos||0); });
const sinParcelas = r.tablas.fincas.filter(f => !porFinca[f.nombre]).map(f=>f.nombre); console.log('fincas sin parcelas:', sinParcelas);
