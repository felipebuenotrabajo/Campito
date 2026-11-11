// Claves PÚBLICAS de Supabase (pensadas para ir en el navegador).
// La seguridad real está en las políticas RLS de la base de datos: sin iniciar sesión y sin estar
// en la tabla "miembros" no se puede leer ni escribir nada.
export const SUPABASE_URL = 'https://xbbydosuootyyqkfdcgz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiYnlkb3N1b290eXlxa2ZkY2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzMwOTcsImV4cCI6MjEwOTkwOTA5N30.v-yl1vpqzAaM7NW0ELOLeNO5kovWggITCRyLzhttgyw';
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
