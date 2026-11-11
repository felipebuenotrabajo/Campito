-- Fincas de trabajo: agrupan varias parcelas SIGPAC. El diario y las cosechas se anotan por finca.
create table public.fincas (
  id             bigint generated always as identity primary key,
  nombre         text not null unique,
  cultivo_id     bigint references public.cultivos(id),
  explotacion_id bigint references public.entidades(id),
  lote_id        bigint references public.entidades(id),
  activa         boolean not null default true,
  notas          text
);
create index on public.fincas(cultivo_id);

alter table public.parcelas add column finca_id bigint references public.fincas(id);
create index on public.parcelas(finca_id);

alter table public.diario_trabajo drop constraint diario_trabajo_parcela_id_fkey;
alter table public.diario_trabajo rename column parcela_id to finca_id;
alter table public.diario_trabajo add constraint diario_trabajo_finca_id_fkey foreign key (finca_id) references public.fincas(id);
alter index public.diario_trabajo_parcela_id_idx rename to diario_trabajo_finca_id_idx;

alter table public.cosechas drop constraint cosechas_parcela_id_fkey;
alter table public.cosechas rename column parcela_id to finca_id;
alter table public.cosechas add constraint cosechas_finca_id_fkey foreign key (finca_id) references public.fincas(id);
alter index public.cosechas_parcela_id_idx rename to cosechas_finca_id_idx;

update public.ajustes set valor = '59.85' where clave = 'precio_jornal';
alter table public.diario_trabajo alter column precio_jornal set default 59.85;

alter table public.fincas enable row level security;
create policy "leer"     on public.fincas for select to authenticated using ((select public.mi_rol()) is not null);
create policy "insertar" on public.fincas for insert to authenticated with check ((select public.mi_rol()) in ('admin','editor'));
create policy "editar"   on public.fincas for update to authenticated using ((select public.mi_rol()) in ('admin','editor')) with check ((select public.mi_rol()) in ('admin','editor'));
create policy "borrar"   on public.fincas for delete to authenticated using ((select public.mi_rol()) = 'admin');
