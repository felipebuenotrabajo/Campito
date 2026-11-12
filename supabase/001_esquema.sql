-- =====================================================================
-- CAMPITO · Esquema inicial (agricultura: viñas, olivos, almendros, barbechos, cereal)
-- Sin ganadería. Acceso solo para miembros autorizados (RLS).
-- =====================================================================

-- ---------- Acceso ---------------------------------------------------
create table public.miembros (
  email      text primary key,
  nombre     text,
  rol        text not null default 'editor' check (rol in ('admin','editor','lector')),
  creado_en  timestamptz not null default now()
);

-- Rol del usuario con sesión iniciada (null si no es miembro)
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.miembros
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
revoke all on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- El primer usuario que la llame cuando no hay miembros se convierte en admin
create or replace function public.reclamar_admin() returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_email is null then raise exception 'Sin sesión'; end if;
  if exists (select 1 from public.miembros) then raise exception 'Ya existe un administrador'; end if;
  insert into public.miembros(email, rol) values (v_email, 'admin');
  return 'admin';
end $$;
revoke all on function public.reclamar_admin() from public, anon;
grant execute on function public.reclamar_admin() to authenticated;

-- ---------- Ajustes --------------------------------------------------
create table public.ajustes (
  clave text primary key,
  valor text not null,
  descripcion text
);
insert into public.ajustes values
  ('horas_por_jornal', '6',     'Horas que equivalen a un jornal'),
  ('precio_jornal',    '58.11', 'Precio del jornal por defecto (€)');

-- ---------- Catálogos -------------------------------------------------
create table public.entidades (          -- personas, sociedades y "común"
  id              bigint generated always as identity primary key,
  nombre          text not null unique,
  nombre_completo text,
  tipo            text not null check (tipo in ('persona','sociedad','comun')),
  activa          boolean not null default true,
  orden           int not null default 0
);
insert into public.entidades(nombre, nombre_completo, tipo, orden) values
  ('Antonio','Antonio Bueno Becerra','persona',1),
  ('Pepe','José Bueno Becerra','persona',2),
  ('Ada','Iluminada Fernández Lencero','persona',3),
  ('Cati','Catalina Bueno Becerra','persona',4),
  ('Felipe','Felipe Bueno Becerra','persona',5),
  ('FBF','Felipe Bueno Fernández','persona',6),
  ('Hermanos Bueno SC','Hermanos Bueno, SC','sociedad',7),
  ('Agrobueno SC','Agrobueno, SC','sociedad',8),
  ('Común',null,'comun',9);

create table public.cultivos (
  id     bigint generated always as identity primary key,
  nombre text not null unique,
  grupo  text not null check (grupo in ('Viñas','Olivos','Almendros','Barbechos','Cereales'))
);
insert into public.cultivos(nombre, grupo) values
  ('Olivos','Olivos'),('Viñas Tintas','Viñas'),('Viñas Blancas','Viñas'),
  ('Almendros','Almendros'),('Barbechos','Barbechos'),('Cereales','Cereales');

create table public.tareas (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activa boolean not null default true
);

create table public.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  nif text,
  notas text
);

create table public.compradores (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  cif text,
  notas text
);

create table public.conceptos_gasto (
  id bigint generated always as identity primary key,
  nombre text not null unique
);

-- ---------- Parcelas --------------------------------------------------
create table public.parcelas (
  id                  bigint generated always as identity primary key,
  nombre              text not null,
  codigo              int,
  poligono            text,
  parcela             text,
  recinto             text,
  termino             text,
  ha_sigpac           numeric(10,4),
  ha_otros_recintos   numeric(10,4),
  ha_total            numeric(10,4) generated always as (coalesce(ha_sigpac,0) + coalesce(ha_otros_recintos,0)) stored,
  fanegas             numeric(10,4) generated always as ((coalesce(ha_sigpac,0) + coalesce(ha_otros_recintos,0)) * 10000 / 6440) stored,
  pendiente           numeric(5,1),
  region              text,
  lic_zepa            text,
  nitratos            text,
  cultivo_id          bigint references public.cultivos(id),
  variedad            text,
  anio_plantacion     int,
  agroambientales     text,
  titular_catastro    text,
  propietario         text,
  n_parcela_registral text,
  reg_viticola        text,
  n_olivos_do         int,
  comunidad_regantes  text,
  explotacion_id      bigint references public.entidades(id),   -- quién lleva la contabilidad (FBF, Cati, Felipe, Común)
  lote_id             bigint references public.entidades(id),   -- a quién pertenece la cosecha
  tasacion_reparto    numeric(12,2),
  toma_agua           text,
  expediente_riego    text,
  activa              boolean not null default true,
  notas               text,
  creado_en           timestamptz not null default now(),
  creado_por          uuid default auth.uid()
);
create index on public.parcelas(cultivo_id);
create index on public.parcelas(explotacion_id);
create index on public.parcelas(lote_id);

-- ---------- Diario de trabajo ----------------------------------------
create table public.diario_trabajo (
  id              bigint generated always as identity primary key,
  fecha           date not null,
  tajo            text not null check (tajo in ('Viñas','Olivos','Almendros','Barbechos','Cereales','Día de orden','Casa')),
  trabajadores    numeric(6,2) not null default 1,
  tarea_id        bigint references public.tareas(id),
  parcela_id      bigint references public.parcelas(id),
  horas_por_peon  numeric(8,3),
  horas           numeric(10,3) not null,                       -- horas totales (trabajadores × horas por peón)
  precio_jornal   numeric(8,2) not null default 58.11,
  pagado_por_id   bigint references public.entidades(id),       -- si es null se usa la explotación de la parcela
  notas           text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid()
);
create index on public.diario_trabajo(fecha);
create index on public.diario_trabajo(parcela_id);
create index on public.diario_trabajo(tarea_id);

-- ---------- Gastos -----------------------------------------------------
create table public.gastos (
  id              bigint generated always as identity primary key,
  numero          text,
  fecha           date not null,
  concepto_id     bigint references public.conceptos_gasto(id),
  cantidad        numeric(12,3) default 1,
  factura_a_id    bigint references public.entidades(id),       -- a nombre de quién está la factura
  empresa_real_id bigint references public.entidades(id),       -- quién lo debe realmente
  proveedor_id    bigint references public.proveedores(id),
  num_factura     text,
  aplicacion      text,
  destino         text check (destino in ('Todos','Viñas','Olivos','Almendros','Barbechos','Cereales','Casa','A cuenta','Her')),
  importante      boolean not null default false,
  importe         numeric(12,2) not null default 0,
  iva_pct         numeric(5,2) not null default 0,
  total           numeric(12,2) not null default 0,
  fecha_pago      date,
  modalidad_pago  text,
  pagado_por_id   bigint references public.entidades(id),
  notas           text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid()
);
create index on public.gastos(fecha);
create index on public.gastos(proveedor_id);
create index on public.gastos(concepto_id);
create index on public.gastos(empresa_real_id);

-- ---------- Ingresos ---------------------------------------------------
create table public.ingresos (
  id              bigint generated always as identity primary key,
  numero          text,
  fecha           date not null,
  campania        text,                                          -- 2025, 2024/25…
  producto        text,                                          -- Viñas, Olivos, Pac, Sub Gasoil…
  tipo            text,                                          -- Blanca, Tinto, Almazara, Aderezo, Sub, Pac…
  empresa_id      bigint references public.entidades(id),       -- quién factura
  agricultor_id   bigint references public.entidades(id),       -- agricultor real
  kilos           numeric(14,2),
  precio_kg       numeric(10,4),
  base            numeric(12,2) not null default 0,
  retencion       numeric(12,2) not null default 0,
  iva_pct         numeric(5,2) not null default 0,
  total           numeric(12,2) not null default 0,
  importante      boolean not null default false,
  comprador_id    bigint references public.compradores(id),
  fecha_cobro     date,
  banco           text,
  notas           text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid()
);
create index on public.ingresos(fecha);
create index on public.ingresos(agricultor_id);

-- ---------- Cosechas ---------------------------------------------------
create table public.cosechas (
  id              bigint generated always as identity primary key,
  fecha           date not null,
  trabajadores    numeric(6,2),
  parcela_id      bigint references public.parcelas(id),
  cultivo         text,                                          -- Blanca, Tinta, Olivos, Almendros
  lote_id         bigint references public.entidades(id),
  tipo            text,
  kilos_netos     numeric(14,2),
  kilos_limpios   numeric(14,2),
  concepto        text check (concepto in ('Grado','Rdto','Tamaño')),
  valor           numeric(10,3),                                 -- grados / rendimiento / tamaño
  notas           text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid()
);
create index on public.cosechas(fecha);
create index on public.cosechas(parcela_id);

-- ---------- Cuentas y movimientos --------------------------------------
create table public.cuentas (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,
  entidad_id  bigint references public.entidades(id),
  banco       text default 'Cooperativa',
  referencia  text
);
insert into public.cuentas(nombre, entidad_id, referencia)
select v.n, e.id, v.r from (values
  ('Hermanos Bueno','Hermanos Bueno SC','8651'),
  ('Agrobueno','Agrobueno SC','9300'),
  ('Antonio','Antonio','3671'),
  ('Cati','Cati','8662'),
  ('Felipe','Felipe','3682'),
  ('FBF','FBF','1312')) as v(n, en, r)
join public.entidades e on e.nombre = v.en;

create table public.movimientos_cuenta (
  id          bigint generated always as identity primary key,
  cuenta_id   bigint not null references public.cuentas(id),
  fecha       date not null,
  concepto    text not null,
  cargo       numeric(12,2) not null default 0,
  ingreso     numeric(12,2) not null default 0,
  creado_en   timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);
create index on public.movimientos_cuenta(cuenta_id, fecha);

-- ---------- Inventario -------------------------------------------------
create table public.inventario (
  id                       bigint generated always as identity primary key,
  producto                 text not null,
  matricula                text,
  unidades                 int default 1,
  fecha_compra             date,
  n_chasis                 text,
  destino                  text,
  propiedad                text,
  fecha_primera_matricula  date,
  situacion                text,
  notas                    text,
  creado_en                timestamptz not null default now()
);

-- ---------- Correspondencia -------------------------------------------
create table public.correspondencia (
  id                       bigint generated always as identity primary key,
  codigo                   text,
  fecha                    date not null,
  sentido                  text not null check (sentido in ('Entrada','Salida')),
  remitente_destinatario   text,
  afecta_a                 text,
  referencia               text,
  importante               boolean not null default false,
  contenido                text,
  creado_en                timestamptz not null default now(),
  creado_por               uuid default auth.uid()
);
create index on public.correspondencia(fecha);

-- ---------- Seguridad: RLS en todo ------------------------------------
alter table public.miembros enable row level security;
create policy "leer"     on public.miembros for select to authenticated using ((select public.mi_rol()) is not null);
create policy "insertar" on public.miembros for insert to authenticated with check ((select public.mi_rol()) = 'admin');
create policy "editar"   on public.miembros for update to authenticated using ((select public.mi_rol()) = 'admin') with check ((select public.mi_rol()) = 'admin');
create policy "borrar"   on public.miembros for delete to authenticated using ((select public.mi_rol()) = 'admin');

do $$
declare t text;
begin
  foreach t in array array[
    'ajustes','entidades','cultivos','tareas','proveedores','compradores','conceptos_gasto',
    'parcelas','diario_trabajo','gastos','ingresos','cosechas','cuentas','movimientos_cuenta',
    'inventario','correspondencia'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leer" on public.%I for select to authenticated using ((select public.mi_rol()) is not null)', t);
    execute format('create policy "insertar" on public.%I for insert to authenticated with check ((select public.mi_rol()) in (''admin'',''editor''))', t);
    execute format('create policy "editar" on public.%I for update to authenticated using ((select public.mi_rol()) in (''admin'',''editor'')) with check ((select public.mi_rol()) in (''admin'',''editor''))', t);
    execute format('create policy "borrar" on public.%I for delete to authenticated using ((select public.mi_rol()) = ''admin'')', t);
  end loop;
end $$;
