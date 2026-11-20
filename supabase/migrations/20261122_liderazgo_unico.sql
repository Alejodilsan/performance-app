-- Liderazgo único: una persona lidera como máximo UN área y pertenece a esa misma área (un solo equipo).
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261121_periodos.sql).
--
-- Reglas (garantizadas en la BD, vengan del tablero, la ficha o la carga masiva):
--  1. areas.lider_id es único: nadie lidera dos áreas.
--  2. Al asignar un líder, esa persona pasa a pertenecer al área que lidera y deja de liderar la anterior.
--  3. Si el líder cambia de área o se desvincula, el área que lideraba queda sin líder.
-- Los cambios de área de las personas quedan en su historial (trigger registrar_historial_empleado).

-- 1. Datos existentes ------------------------------------------------------------
-- 1a. Quien lidera varias áreas conserva la que coincide con su área actual (o la de menor id); las demás quedan sin líder.
with liderazgos as (
  select a.id, a.lider_id,
         row_number() over (partition by a.lider_id order by (a.id = e.area_id) desc, a.id) as orden
  from public.areas a
  left join public.empleados e on e.id = a.lider_id
  where a.lider_id is not null
)
update public.areas a set lider_id = null
from liderazgos l
where a.id = l.id and l.orden > 1;

-- 1b. Líderes desvinculados o inexistentes: el área queda sin líder
update public.areas a set lider_id = null
where a.lider_id is not null
  and not exists (select 1 from public.empleados e where e.id = a.lider_id and coalesce(e.estado_contratacion, 'activo') <> 'desvinculado');

-- 1c. Cada líder pasa a pertenecer al área que lidera
update public.empleados e set area_id = a.id
from public.areas a
where a.lider_id = e.id and e.area_id is distinct from a.id;

-- 2. Un área por líder -------------------------------------------------------------
create unique index if not exists areas_lider_unico_idx on public.areas (lider_id) where lider_id is not null;

-- 3. Al asignar un líder: deja de liderar otra área (antes de guardar) y pasa al área (después de guardar)
create or replace function public.areas_liberar_liderazgo_previo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lider_id is not null and new.lider_id is distinct from old.lider_id then
    update public.areas set lider_id = null where lider_id = new.lider_id and id <> new.id;
  end if;
  return new;
end;
$$;

create or replace function public.areas_mover_lider_a_su_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lider_id is not null and (tg_op = 'INSERT' or new.lider_id is distinct from old.lider_id) then
    update public.empleados set area_id = new.id where id = new.lider_id and area_id is distinct from new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists areas_liberar_liderazgo_previo on public.areas;
create trigger areas_liberar_liderazgo_previo
  before insert or update of lider_id on public.areas
  for each row execute function public.areas_liberar_liderazgo_previo();

drop trigger if exists areas_mover_lider_a_su_area on public.areas;
create trigger areas_mover_lider_a_su_area
  after insert or update of lider_id on public.areas
  for each row execute function public.areas_mover_lider_a_su_area();

-- 4. Si el líder cambia de área o se desvincula, el área que lideraba queda sin líder
create or replace function public.empleados_liberar_liderazgo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_contratacion = 'desvinculado' then
    update public.areas set lider_id = null where lider_id = new.id;
  elsif new.area_id is distinct from old.area_id then
    update public.areas set lider_id = null where lider_id = new.id and id is distinct from new.area_id;
  end if;
  return null;
end;
$$;

drop trigger if exists empleados_liberar_liderazgo on public.empleados;
create trigger empleados_liberar_liderazgo
  after update of area_id, estado_contratacion on public.empleados
  for each row execute function public.empleados_liberar_liderazgo();
