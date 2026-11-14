// Contorno de las parcelas desde la API pública de SIGPAC (sigpac-hubcloud.es, CC-BY 4.0)
import { esc, numf } from './util.js';
import { clave } from './parser.js';

const BASE = 'https://sigpac-hubcloud.es/ogcapi/collections/recintos/items';
const MUNICIPIOS = { 'VILLALBA BARROS': 152, 'VILLALBA DE LOS BARROS': 152, 'SANTA MARTA': 121, 'FUENTE MAESTRE': 54, ACEUCHAL: 2 };

export const hayCodigo = (r) => !!MUNICIPIOS[clave(r.termino || '').toUpperCase()] && /^\d+/.test(String(r.parcela || '').trim()) && /^\d+$/.test(String(r.poligono || '').trim());
export const listaRecintos = (s) => [...new Set(String(s || '').split(/[,.;\s]+/).map((n) => parseInt(n, 10)).filter(Number.isFinite))];

const poligonos = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
function areaHa(poly) {
  const lat0 = (poly[0][0][1] * Math.PI) / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
  const a = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * kx * (r[i + 1][1] * ky) - r[i + 1][0] * kx * (r[i][1] * ky); return Math.abs(s / 2); };
  return (a(poly[0]) - poly.slice(1).reduce((t, r) => t + a(r), 0)) / 10000;
}
const r6 = (n) => Math.round(n * 1e6) / 1e6;

// Devuelve el objeto a guardar en parcelas.sigpac (o lanza un Error con mensaje legible)
export async function consultar(r) {
  if (!hayCodigo(r)) throw new Error('Falta término, polígono o parcela válidos');
  const mun = MUNICIPIOS[clave(r.termino).toUpperCase()];
  const par = parseInt(String(r.parcela).trim(), 10), pol = parseInt(String(r.poligono).trim(), 10);
  const res = await fetch(`${BASE}?f=json&limit=200&provincia=6&municipio=${mun}&poligono=${pol}&parcela=${par}`);
  if (!res.ok) throw new Error(`SIGPAC respondió ${res.status}`);
  const todos = ((await res.json()).features || []).filter((f) => f.properties && f.properties.poligono === pol && f.properties.parcela === par);
  if (!todos.length) throw new Error('SIGPAC no devuelve recintos para ese polígono y parcela');
  const pedidos = listaRecintos(r.recinto);
  const usados = pedidos.length ? todos.filter((f) => pedidos.includes(f.properties.recinto)) : todos;
  const faltan = pedidos.filter((n) => !todos.some((f) => f.properties.recinto === n));
  const recintos = usados.map((f) => ({ r: f.properties.recinto, ha: r6(poligonos(f.geometry).reduce((s, p) => s + areaHa(p), 0)), pend: f.properties.pendiente_media, alt: f.properties.altitud })).sort((a, b) => a.r - b.r);
  const redondea = (p) => p.map((anillo) => anillo.map((c) => [r6(c[0]), r6(c[1])]));
  return {
    fecha: new Date().toISOString(),
    ha: r6(recintos.reduce((s, q) => s + q.ha, 0)),
    recintos,
    faltan,
    resto: todos.length - usados.length,
    sel: usados.flatMap((f) => poligonos(f.geometry)).map(redondea),
    otros: todos.filter((f) => !usados.includes(f)).flatMap((f) => poligonos(f.geometry)).map(redondea),
  };
}

export function dibujo(s) {
  const todos = [...(s.sel || []), ...(s.otros || [])];
  const pts = todos.flatMap((p) => p[0]);
  if (!pts.length) return '';
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = (x1 - x0) * k || 1e-6, h = y1 - y0 || 1e-6, sc = 300 / Math.max(w, h);
  const P = (c) => `${((c[0] - x0) * k * sc + 10).toFixed(1)},${((y1 - c[1]) * sc + 10).toFixed(1)}`;
  const path = (p, cls) => `<path class="${cls}" d="${p.map((a) => 'M' + a.map(P).join('L') + 'Z').join('')}" fill-rule="evenodd"/>`;
  return `<svg viewBox="0 0 ${(w * sc + 20).toFixed(0)} ${(h * sc + 20).toFixed(0)}" role="img" aria-label="Contorno de la parcela según SIGPAC">${(s.otros || []).map((p) => path(p, 'sg-otro')).join('')}${(s.sel || []).map((p) => path(p, 'sg-sel')).join('')}</svg>`;
}

export function bloqueHTML(r, puedeEditar) {
  const s = r.sigpac;
  let info = '';
  if (s) {
    const excel = Number(r.ha_sigpac) || 0;
    const dif = excel ? ((s.ha - excel) / excel) * 100 : null;
    const aviso = dif != null && Math.abs(dif) > 3 ? ` <b class="sg-aviso">⚠ difiere un ${numf(Math.abs(dif), 1)} % del Excel</b>` : '';
    info = `<p class="sg-info">Recintos ${esc(s.recintos.map((q) => q.r).join(', '))} · <b>${numf(s.ha, 4)} ha</b> según SIGPAC${excel ? ` · Excel: ${numf(excel, 4)} ha` : ''}${aviso}</p>`
      + (s.faltan?.length ? `<p class="sg-aviso">Los recintos ${esc(s.faltan.join(', '))} no existen en SIGPAC para esta parcela.</p>` : '')
      + (s.resto ? `<p class="sg-info">En gris, ${s.resto} recinto(s) de la misma parcela que no tienes en esta fila.</p>` : '')
      + `<small>Datos SIGPAC (FEGA), CC-BY 4.0 · actualizado ${esc(String(s.fecha).slice(0, 10).split('-').reverse().join('/'))}</small>`;
  }
  return `<div class="sigpac-bloque">${s ? `<div class="sg-dib">${dibujo(s)}</div>` : '<p class="sg-info">Sin contorno guardado todavía.</p>'}${info}${puedeEditar ? `<button type="button" class="btn suave" data-sigpac>${s ? 'Actualizar' : 'Cargar'} desde SIGPAC</button>` : ''}</div>`;
}

// Enlace directo al visor SIGPAC (formato documentado en la ayuda del visor, apartado "Por referencia SIGPAC")
export function enlaceVisor(r) {
  const visor = 'https://sigpac.mapa.gob.es/fega/visor/';
  if (!hayCodigo(r)) return visor;
  const mun = MUNICIPIOS[clave(r.termino).toUpperCase()];
  const rec = listaRecintos(r.recinto)[0];
  return `${visor}?provincia=6&municipio=${mun}&agregado=0&zona=0&poligono=${parseInt(r.poligono, 10)}&parcela=${parseInt(r.parcela, 10)}${rec ? `&recinto=${rec}` : ''}`;
}
