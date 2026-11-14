-- Notas personales: cada usuario solo ve y modifica las suyas
create table if not exists public.notas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (length(btrim(texto)) > 0),
  creada_en timestamptz not null default now(),
  editada_en timestamptz
);
create index if not exists notas_user_fecha on public.notas (user_id, creada_en desc);
alter table public.notas enable row level security;
create policy "notas_leer"     on public.notas for select to authenticated using (user_id = (select auth.uid()) and (select public.mi_rol()) is not null);
create policy "notas_insertar" on public.notas for insert to authenticated with check (user_id = (select auth.uid()) and (select public.mi_rol()) is not null);
create policy "notas_editar"   on public.notas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notas_borrar"   on public.notas for delete to authenticated using (user_id = (select auth.uid()));
