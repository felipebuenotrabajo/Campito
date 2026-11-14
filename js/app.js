import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS } from './config.js';
import { ENTIDADES, MENU, GRUPOS, ICONOS } from './esquema.js';
import { montarCrud, cargarTodo, mensajeError } from './crud.js';
import { montarResumen } from './resumen.js';
import { montarPersonas } from './personas.js';
import { montarProduccion, montarSemanas } from './produccion.js';
import { montarImportar } from './importar.js';
import { montarNotas } from './notas.js';
import { $, $$, esc, toast } from './util.js';

const app = $('#app');
const { createClient } = await import(SUPABASE_JS);
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

// catálogos que se cargan una vez y se usan en listas desplegables y nombres
const CATS = {
  entidades: { orden: [['orden', true]] }, cultivos: { orden: [['nombre', true]] },
  fincas: { orden: [['nombre', true]], select: 'id,nombre,cultivo_id,explotacion_id,lote_id' },
  tareas: { orden: [['nombre', true]] }, proveedores: { orden: [['nombre', true]] }, compradores: { orden: [['nombre', true]] },
  conceptos_gasto: { orden: [['nombre', true]] }, cuentas: { orden: [['nombre', true]] },
  parcelas: { orden: [['nombre', true]], select: 'id,nombre,finca_id,ha_total' },
};
const maps = {};
const x = {
  sb, rol: null, email: null, cat: {}, ajustes: { horas_por_jornal: 6, precio_jornal: 59.85 },
  nombre: (t, id) => (id == null ? null : maps[t]?.get(id)?.nombre ?? null),
  async refrescarCat(t) {
    x.cat[t] = await cargarTodo(sb, t, CATS[t].orden, CATS[t].select || '*');
    maps[t] = new Map(x.cat[t].map((r) => [r.id, r]));
  },
};

// ---------- autenticación ----------
function pantallaAcceso(modo = 'entrar', mensaje = '') {
  app.innerHTML = `
    <main class="acceso">
      <div class="acceso-caja">
        <div class="marca grande"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS.cosechas}"/></svg><span>Campito</span></div>
        <p class="lema">La gestión del campo, a mano.</p>
        <div class="pestanas" role="tablist"><button role="tab" data-m="entrar" aria-selected="${modo === 'entrar'}">Entrar</button><button role="tab" data-m="crear" aria-selected="${modo === 'crear'}">Crear cuenta</button></div>
        <form id="f-acceso">
          <label>Correo electrónico<input type="email" name="email" autocomplete="email" required></label>
          <label>Contraseña<input type="password" name="pass" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}" minlength="8" required></label>
          <button class="btn primario ancho" type="submit">${modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
          ${modo === 'entrar' ? '<button class="enlace" type="button" id="olvido">He olvidado la contraseña</button>' : '<p class="nota">Usa el correo con el que te hayan dado de alta. Recibirás un mensaje para confirmarlo.</p>'}
        </form>
        <p class="msg" role="status">${esc(mensaje)}</p>
      </div>
    </main>`;
  $$('[data-m]').forEach((b) => b.addEventListener('click', () => pantallaAcceso(b.dataset.m)));
  $('#f-acceso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, pass } = Object.fromEntries(new FormData(e.target));
    const msg = $('.msg'); msg.textContent = '…';
    if (modo === 'entrar') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) msg.textContent = /Invalid login/i.test(error.message) ? 'Correo o contraseña incorrectos.' : /not confirmed/i.test(error.message) ? 'Falta confirmar el correo: revisa tu bandeja de entrada.' : error.message;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
      msg.textContent = error ? error.message : data.session ? '' : 'Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación; después vuelve aquí y entra.';
    }
  });
  $('#olvido')?.addEventListener('click', async () => {
    const email = $('[name=email]').value.trim();
    if (!email) return ($('.msg').textContent = 'Escribe primero tu correo.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('.msg').textContent = error ? error.message : 'Te hemos enviado un enlace para cambiar la contraseña.';
  });
}

function pantallaSinAcceso() {
  app.innerHTML = `
    <main class="acceso"><div class="acceso-caja">
      <div class="marca grande"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS.cosechas}"/></svg><span>Campito</span></div>
      <h2>Aún no tienes acceso</h2>
      <p>Has entrado como <b>${esc(x.email)}</b>, pero este correo no está en la lista de miembros. Pide a un administrador que lo añada y vuelve a entrar.</p>
      <button class="btn suave ancho" id="reclamar">Soy la primera persona: quedarme como administrador</button>
      <button class="enlace" id="salir">Cerrar sesión</button>
      <p class="msg" role="status"></p>
    </div></main>`;
  $('#salir').onclick = () => sb.auth.signOut();
  $('#reclamar').onclick = async () => {
    const { error } = await sb.rpc('reclamar_admin');
    if (error) return ($('.msg').textContent = /Ya existe/.test(error.message) ? 'Ya hay un administrador. Pídele que te añada.' : error.message);
    arrancar();
  };
}

// ---------- estructura y navegación ----------
const item = (m) => {
  const e = ENTIDADES[m.id];
  return { id: m.id, titulo: m.titulo || e?.titulo, icono: m.icono || e?.icono || 'catalogo', grupo: m.grupo || e?.grupo, soloAdmin: m.soloAdmin || e?.soloAdmin };
};
const icono = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n] || ICONOS.catalogo}"/></svg>`;

function montarShell() {
  const items = MENU.map(item).filter((m) => !m.soloAdmin || x.rol === 'admin');
  const grupos = Object.keys(GRUPOS).map((g) => ({ g, items: items.filter((i) => i.grupo === g) })).filter((g) => g.items.length);
  const link = (i, cls = 'nav-item') => `<a href="#/${i.id}" class="${cls}" data-id="${i.id}">${icono(i.icono)}<span>${esc(i.titulo)}</span></a>`;
  const rapidos = ['resumen', 'diario_trabajo', 'gastos', 'ingresos'].map((id) => items.find((i) => i.id === id));
  const etiquetaCorta = { diario_trabajo: 'Diario' };
  app.innerHTML = `
    <div class="shell">
      <aside class="lateral">
        <div class="marca"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS.cosechas}"/></svg><span>Campito</span></div>
        <nav aria-label="Principal">${grupos.map((g) => `<div class="grupo-nav"><h4>${GRUPOS[g.g]}</h4>${g.items.map((i) => link(i)).join('')}</div>`).join('')}</nav>
        <div class="usuario"><span title="${esc(x.email)}">${esc(x.email)}</span><small>${x.rol}</small><button class="enlace" id="salir">Cerrar sesión</button></div>
      </aside>
      <main id="main" tabindex="-1"></main>
      <nav class="inferior" aria-label="Principal">
        ${rapidos.map((i) => `<a href="#/${i.id}" data-id="${i.id}">${icono(i.icono)}<span>${esc(etiquetaCorta[i.id] || i.titulo)}</span></a>`).join('')}
        <button id="mas" aria-haspopup="dialog">${icono('mas')}<span>Más</span></button>
      </nav>
      <div class="hoja" id="hoja" hidden>
        <div class="hoja-caja" role="dialog" aria-label="Todas las secciones">
          ${grupos.map((g) => `<h4>${GRUPOS[g.g]}</h4><div class="hoja-grid">${g.items.map((i) => link(i, 'hoja-item')).join('')}</div>`).join('')}
          <div class="usuario"><span>${esc(x.email)}</span> <small>${x.rol}</small> <button class="enlace" id="salir2">Cerrar sesión</button></div>
        </div>
      </div>
    </div>`;
  $('#salir').onclick = $('#salir2').onclick = () => sb.auth.signOut();
  $('#mas').onclick = () => ($('#hoja').hidden = false);
  $('#hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja' || e.target.closest('a')) $('#hoja').hidden = true; });
}

let rutaActual = null;
async function ruta() {
  const id = (location.hash.match(/^#\/([\w]+)/) || [])[1] || 'resumen';
  const m = MENU.map(item).find((i) => i.id === id);
  const main = $('#main');
  if (!m || (m.soloAdmin && x.rol !== 'admin')) { location.hash = '#/resumen'; return; }
  rutaActual = id;
  $$('[data-id]').forEach((a) => a.classList.toggle('activo', a.dataset.id === id));
  document.title = `${m.titulo} · Campito`;
  main.replaceChildren();
  const cont = document.createElement('div'); cont.className = 'pagina'; main.append(cont);
  try {
    if (id === 'resumen') await montarResumen(cont, x);
    else if (id === 'personas') await montarPersonas(cont, x);
    else if (id === 'produccion') await montarProduccion(cont, x);
    else if (id === 'semanas') await montarSemanas(cont, x);
    else if (id === 'notas') await montarNotas(cont, x);
    else if (id === 'importar') await montarImportar(cont, x);
    else await montarCrud(id, cont, x);
  } catch (e) { cont.innerHTML = `<div class="vacio">Algo ha fallado: ${esc(mensajeError(e))}</div>`; console.error(e); }
  main.scrollTo?.(0, 0); window.scrollTo(0, 0);
}

// ---------- arranque ----------
let arrancando = false;
async function arrancar() {
  if (arrancando) return;
  arrancando = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return pantallaAcceso();
    x.email = session.user.email;
    const { data: rol } = await sb.rpc('mi_rol');
    if (!rol) return pantallaSinAcceso();
    x.rol = rol;
    app.innerHTML = '<div class="cargando pantalla">Cargando datos…</div>';
    await Promise.all(Object.keys(CATS).map((t) => x.refrescarCat(t)));
    const { data: aj } = await sb.from('ajustes').select('clave,valor');
    for (const a of aj || []) x.ajustes[a.clave] = Number(a.valor);
    montarShell();
    await ruta();
  } catch (e) {
    app.innerHTML = `<main class="acceso"><div class="acceso-caja"><h2>No se pudo cargar</h2><p>${esc(mensajeError(e))}</p><button class="btn primario" onclick="location.reload()">Reintentar</button></div></main>`;
  } finally { arrancando = false; }
}

sb.auth.onAuthStateChange((evento) => {
  if (evento === 'PASSWORD_RECOVERY') {
    const nueva = prompt('Escribe tu nueva contraseña (mínimo 8 caracteres):');
    if (nueva && nueva.length >= 8) sb.auth.updateUser({ password: nueva }).then(({ error }) => toast(error ? error.message : 'Contraseña cambiada', error ? 'error' : 'ok'));
  }
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') setTimeout(arrancar, 0);
});
window.addEventListener('hashchange', () => { if (x.rol) ruta(); });
arrancar();
