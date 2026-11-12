-- Fase 1 de las hojas restantes del Excel: Compras Nuevas, Cabidas, títulos de la cooperativa,
-- derechos PAC (Valor derechos Antonio) y cuentas de Ada.

create table public.maquinaria (
  id             bigint generated always as identity primary key,
  equipo         text not null,
  pagado_por_id  bigint references public.entidades(id),
  referencia     text,            -- nº de gasto (año-nº) o nota, p. ej. «26-227» o «CASA 1264»
  notas          text,
  creado_en      timestamptz not null default now()
);

create table public.cabidas (
  id          bigint generated always as identity primary key,
  socio_id    bigint not null references public.entidades(id),
  producto    text not null check (producto in ('Aderezo','Almazara','Blanca','Tinta')),
  fecha       date,
  kg          numeric(12,2),
  valor       numeric(12,2),
  pendiente   numeric(12,2),      -- saldo pendiente de cobro con la cooperativa
  kg_cabida   numeric(12,2),      -- kg que le corresponden en la cooperativa
  notas       text,
  creado_en   timestamptz not null default now()
);

create table public.titulos_cooperativa (
  id            bigint generated always as identity primary key,
  titulos       int not null,
  euros_titulo  numeric(10,2),
  capital       numeric(12,2),
  fecha         date,
  pendientes    int default 0,
  titular_id    bigint references public.entidades(id),
  notas         text,
  creado_en     timestamptz not null default now()
);

create table public.derechos_pac (
  id          bigint generated always as identity primary key,
  numero      int not null unique,
  valor_2024  numeric(10,2),
  valor_2025  numeric(10,2),
  valor_2026  numeric(10,2),
  valor_2027  numeric(10,2),
  notas       text,
  creado_en   timestamptz not null default now()
);

create table public.movimientos_ada (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('Deuda con Ada','Deuda de Ada','Pago a Ada')),
  concepto    text not null,
  fecha       date,
  referencia  text,
  importe     numeric(12,2) not null default 0,
  banco       text,
  notas       text,
  creado_en   timestamptz not null default now()
);

create index on public.maquinaria(pagado_por_id);
create index on public.cabidas(socio_id);
create index on public.titulos_cooperativa(titular_id);

do $$
declare t text;
begin
  foreach t in array array['maquinaria','cabidas','titulos_cooperativa','derechos_pac','movimientos_ada'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leer" on public.%I for select to authenticated using ((select public.mi_rol()) is not null)', t);
    execute format('create policy "insertar" on public.%I for insert to authenticated with check ((select public.mi_rol()) in (''admin'',''editor''))', t);
    execute format('create policy "editar" on public.%I for update to authenticated using ((select public.mi_rol()) in (''admin'',''editor'')) with check ((select public.mi_rol()) in (''admin'',''editor''))', t);
    execute format('create policy "borrar" on public.%I for delete to authenticated using ((select public.mi_rol()) = ''admin'')', t);
  end loop;
end $$;
