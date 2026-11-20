-- Fase 1 de períodos: separar las fotos automáticas del avance de los cierres oficiales.
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261119_cargos_estructura.sql).
--
-- Antes: calificar un KPI reescribía la foto del mes en curso en historico_cumplimiento, la misma tabla y fila
-- que usa "Cerrar Periodo". Consecuencias: (1) un mes ya cerrado se sobrescribía si alguien calificaba después,
-- y (2) cualquier mes con una calificación aparecía como "bloqueado" aunque nadie lo hubiera cerrado.
--
-- Ahora: cada fila dice si es un cierre oficial (oficial = true) o el avance automático (false). Un cierre
-- oficial ya no se puede modificar: si después se califica un KPI de ese mes, la foto oficial se conserva.

alter table public.historico_cumplimiento add column if not exists oficial boolean not null default false;

-- Sin evaluación de potencial no se asume "bajo": el cierre guarda null en vez de 1
alter table public.historico_cumplimiento alter column potencial_score drop not null;

-- Filas existentes: un cierre oficial guarda la MISMA fecha de corte para todas las personas del período,
-- mientras que la foto automática guarda la hora exacta de cada calificación. Se marcan como oficiales los
-- períodos en que al menos 2 personas comparten la fecha de corte.
-- (Revisión manual: select periodo, fecha_corte, count(*), bool_or(oficial) from public.historico_cumplimiento
--  group by 1, 2 order by 2 desc;)
update public.historico_cumplimiento h
set oficial = true
where not h.oficial
  and exists (
    select 1 from public.historico_cumplimiento o
    where o.empresa_id is not distinct from h.empresa_id
      and o.periodo = h.periodo
      and o.fecha_corte = h.fecha_corte
      and o.ctid <> h.ctid
  );

-- Un cierre oficial es inmutable. Si se intenta actualizar (p. ej. la foto automática al calificar un KPI
-- después del cierre), la actualización se ignora sin error y la fila oficial queda como estaba.
create or replace function public.proteger_cierre_oficial()
returns trigger
language plpgsql
as $$
begin
  if old.oficial then
    return null;  -- conserva la foto oficial
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_cierre_oficial on public.historico_cumplimiento;
create trigger proteger_cierre_oficial
  before update on public.historico_cumplimiento
  for each row execute function public.proteger_cierre_oficial();

create index if not exists historico_cumplimiento_oficial_idx on public.historico_cumplimiento (empresa_id, periodo) where oficial;
