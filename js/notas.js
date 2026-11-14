// Notas personales: cada usuario ve solo las suyas; se guardan con fecha y hora
import { $, esc, toast } from './util.js';
import { cargarTodo, mensajeError } from './crud.js';
import { clave } from './parser.js';

const fh = (s) => new Date(s).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' });

export async function montarNotas(cont, x) {
  let notas = [], q = '';
  const cargar = async () => { notas = await cargarTodo(x.sb, 'notas', [['creada_en', false]]); };
  await cargar();
  cont.innerHTML = `
    <header class="cab"><h1>Notas</h1></header>
    <p class="nota-priv">Tus notas son privadas: solo las ves tú.</p>
    <form class="nota-nueva"><label for="nota-txt" class="sr">Nueva nota</label>
      <textarea id="nota-txt" rows="3" placeholder="Escribe una nota…"></textarea>
      <button class="btn primario" type="submit">Guardar nota</button></form>
    <div class="barra"><input type="search" class="buscar" placeholder="Buscar en mis notas…" aria-label="Buscar" autocomplete="off"></div>
    <div class="notas-lista" aria-live="polite"></div>`;

  function pintar() {
    const f = notas.filter((n) => !q || clave(n.texto).includes(clave(q)));
    $('.notas-lista', cont).innerHTML = f.length ? f.map((n) => `
      <article class="nota" data-id="${n.id}">
        <header><time datetime="${esc(n.creada_en)}">${esc(fh(n.creada_en))}</time>${n.editada_en ? `<small>editada ${esc(fh(n.editada_en))}</small>` : ''}</header>
        <div class="nota-texto">${esc(n.texto)}</div>
        <footer><button class="btn suave" data-ed>Editar</button><button class="btn peligro" data-del>Eliminar</button></footer>
      </article>`).join('') : `<div class="vacio">${q ? 'Ninguna nota coincide.' : 'Todavía no has escrito ninguna nota.'}</div>`;
  }
  pintar();

  $('.nota-nueva', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = $('#nota-txt', cont), texto = ta.value.trim();
    if (!texto) return toast('Escribe algo antes de guardar', 'error');
    const btn = $('button', e.target); btn.disabled = true;
    const { error } = await x.sb.from('notas').insert({ texto });
    btn.disabled = false;
    if (error) return toast(mensajeError(error), 'error');
    ta.value = ''; toast('Nota guardada'); await cargar(); pintar();
  });
  $('.buscar', cont).addEventListener('input', (e) => { q = e.target.value; pintar(); });

  $('.notas-lista', cont).addEventListener('click', async (e) => {
    const art = e.target.closest('.nota'); if (!art) return;
    const n = notas.find((m) => String(m.id) === art.dataset.id); if (!n) return;
    if (e.target.closest('[data-del]')) {
      if (!confirm('¿Eliminar esta nota? No se puede deshacer.')) return;
      const { error } = await x.sb.from('notas').delete().eq('id', n.id);
      if (error) return toast(mensajeError(error), 'error');
      toast('Nota eliminada'); await cargar(); return pintar();
    }
    if (e.target.closest('[data-ed]')) {
      $('.nota-texto', art).innerHTML = `<textarea rows="4">${esc(n.texto)}</textarea>`;
      $('footer', art).innerHTML = '<button class="btn suave" data-cancel>Cancelar</button><button class="btn primario" data-ok>Guardar</button>';
      return $('textarea', art).focus();
    }
    if (e.target.closest('[data-cancel]')) return pintar();
    if (e.target.closest('[data-ok]')) {
      const texto = $('textarea', art).value.trim();
      if (!texto) return toast('La nota no puede quedar vacía', 'error');
      const { error } = await x.sb.from('notas').update({ texto, editada_en: new Date().toISOString() }).eq('id', n.id);
      if (error) return toast(mensajeError(error), 'error');
      toast('Nota guardada'); await cargar(); pintar();
    }
  });
}
