-- Gastos personales: «Fhijo» en el Excel. Van enteros a la persona indicada en empresa_real y no se reparten.
-- Los gastos de Hermanos Bueno SC, Agrobueno SC y FBF (sin marcar) se reparten entre socios por hectáreas.
alter table public.gastos add column if not exists es_personal boolean not null default false;
comment on column public.gastos.es_personal is 'Gasto personal de la persona indicada en empresa_real (no se reparte entre socios)';
