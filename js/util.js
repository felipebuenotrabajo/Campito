export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const eur = (n) => (n == null || n === '' || isNaN(n) ? '' : fEur.format(n));
const fEur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur0 = (n) => (n == null || n === '' || isNaN(n) ? '' : fEur0.format(n));
export const numf = (n, d = 2) =>
  n == null || n === '' || isNaN(n) ? '' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(n);
export const fechaf = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

const pad = (n) => String(n).padStart(2, '0');
export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const sumar = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
export const redondea = (n, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

let tt;
export function toast(msg, tipo = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = `toast ${tipo} show`;
  t.textContent = msg;
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), tipo === 'error' ? 6000 : 2600);
}

export function descargarCSV(nombre, cabeceras, filas) {
  const celda = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [cabeceras, ...filas].map((f) => f.map(celda).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
