-- Referencia catastral de cada parcela (para enlazar con la Sede del Catastro)
alter table public.parcelas add column if not exists ref_catastral text;
comment on column public.parcelas.ref_catastral is 'Referencia catastral (14 o 20 caracteres)';
