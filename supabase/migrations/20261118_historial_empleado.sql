-- Historial laboral de cada colaborador: ingreso, cambios de puesto, área, jefe, perfil, contrato,
-- modalidad, sede, jornada, salario, desvinculación y reactivación.
-- Se registra AUTOMÁTICAMENTE con triggers: no importa si el cambio viene del formulario, de la carga
-- masiva o de cualquier otra vía.
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261117_configuracion_bi.sql).

create table if not exists public.historial_empleado (
  id             bigint generated always as identity primary key,
  empleado_id    bigint not null references public.empleados(id) on delete cascade,
  empresa_id     bigint not null,
  tipo           text not null check (tipo in ('ingreso', 'puesto', 'area', 'jefe', 'perfil', 'contrato', 'modalidad',
                                               'sede', 'jornada', 'salario', 'desvinculacion', 'reactivacion')),
  valor_anterior text,
  valor_nuevo    text,
  detalle        text,
  fecha          date not null default current_date,  -- fecha efectiva del cambio
  registrado_por uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists historial_empleado_idx on public.historial_empleado (empleado_id, fecha desc, id desc);
create index if not exists historial_empresa_tipo_idx on public.historial_empleado (empresa_id, tipo, fecha);

-- Solo se lee desde el servidor (/api/historial y /api/bi), que filtra por alcance y oculta salarios a quien no es Admin.
alter table public.historial_empleado enable row level security;

-- ---------------------------------------------------------------------
-- Trigger: alta y cambios en empleados
-- ---------------------------------------------------------------------
create or replace function public.registrar_historial_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_ant text; v_area_nva text; v_jefe_ant text; v_jefe_nvo text;
begin
  if tg_op = 'INSERT' then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_nuevo, detalle, fecha)
    values (new.id, new.empresa_id, 'ingreso', new.puesto,
            (select nombre from areas where id = new.area_id), coalesce(new.fecha_ingreso, current_date));
    return new;
  end if;

  -- La fecha de ingreso se corrige sobre el evento de ingreso (no es un "cambio")
  if new.fecha_ingreso is distinct from old.fecha_ingreso and new.fecha_ingreso is not null then
    update historial_empleado set fecha = new.fecha_ingreso where empleado_id = new.id and tipo = 'ingreso';
    if not found then
      insert into historial_empleado (empleado_id, empresa_id, tipo, valor_nuevo, fecha)
      values (new.id, new.empresa_id, 'ingreso', new.puesto, new.fecha_ingreso);
    end if;
  end if;

  if new.puesto is distinct from old.puesto then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'puesto', old.puesto, new.puesto);
  end if;

  if new.area_id is distinct from old.area_id then
    select nombre into v_area_ant from areas where id = old.area_id;
    select nombre into v_area_nva from areas where id = new.area_id;
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'area', v_area_ant, v_area_nva);
  end if;

  if new.jefe_directo_id is distinct from old.jefe_directo_id then
    select nombre into v_jefe_ant from empleados where id = old.jefe_directo_id;
    select nombre into v_jefe_nvo from empleados where id = new.jefe_directo_id;
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'jefe', v_jefe_ant, v_jefe_nvo);
  end if;

  if new.tipo_perfil is distinct from old.tipo_perfil then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'perfil', old.tipo_perfil, new.tipo_perfil);
  end if;

  if new.tipo_contrato is distinct from old.tipo_contrato then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'contrato', old.tipo_contrato, new.tipo_contrato);
  end if;

  if new.modalidad is distinct from old.modalidad then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'modalidad', old.modalidad, new.modalidad);
  end if;

  if new.sede is distinct from old.sede then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'sede', old.sede, new.sede);
  end if;

  if new.jornada is distinct from old.jornada then
    insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo)
    values (new.id, new.empresa_id, 'jornada', old.jornada, new.jornada);
  end if;

  if new.estado_contratacion is distinct from old.estado_contratacion then
    if new.estado_contratacion = 'desvinculado' then
      insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, detalle, fecha)
      values (new.id, new.empresa_id, 'desvinculacion', new.puesto, new.motivo_desvinculacion,
              coalesce(new.fecha_desvinculacion, current_date));
    else
      insert into historial_empleado (empleado_id, empresa_id, tipo, valor_nuevo)
      values (new.id, new.empresa_id, 'reactivacion', new.puesto);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_historial_empleado on public.empleados;
create trigger trg_historial_empleado
  after insert or update on public.empleados
  for each row execute function public.registrar_historial_empleado();

-- ---------------------------------------------------------------------
-- Trigger: cambios de salario (compensaciones)
-- ---------------------------------------------------------------------
create or replace function public.registrar_historial_salario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  select salario::text || ' ' || moneda || ' ' || periodicidad into v_anterior
  from compensaciones
  where empleado_id = new.empleado_id and id <> new.id and fecha_vigencia <= new.fecha_vigencia
  order by fecha_vigencia desc, created_at desc
  limit 1;

  insert into historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo, detalle, fecha)
  values (new.empleado_id, new.empresa_id, 'salario', v_anterior,
          new.salario::text || ' ' || new.moneda || ' ' || new.periodicidad, new.motivo, new.fecha_vigencia);
  return new;
end;
$$;

drop trigger if exists trg_historial_salario on public.compensaciones;
create trigger trg_historial_salario
  after insert on public.compensaciones
  for each row execute function public.registrar_historial_salario();

-- ---------------------------------------------------------------------
-- Carga inicial con la información que ya existe (idempotente)
-- ---------------------------------------------------------------------
-- Ingresos (de quien tiene fecha de ingreso)
insert into public.historial_empleado (empleado_id, empresa_id, tipo, valor_nuevo, detalle, fecha)
select e.id, e.empresa_id, 'ingreso', e.puesto, a.nombre, e.fecha_ingreso
from public.empleados e
left join public.areas a on a.id = e.area_id
where e.fecha_ingreso is not null
  and not exists (select 1 from public.historial_empleado h where h.empleado_id = e.id and h.tipo = 'ingreso');

-- Salarios ya registrados
insert into public.historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, valor_nuevo, detalle, fecha)
select c.empleado_id, c.empresa_id, 'salario',
       lag(c.salario::text || ' ' || c.moneda || ' ' || c.periodicidad) over (partition by c.empleado_id order by c.fecha_vigencia, c.created_at),
       c.salario::text || ' ' || c.moneda || ' ' || c.periodicidad, c.motivo, c.fecha_vigencia
from public.compensaciones c
where not exists (select 1 from public.historial_empleado h
                  where h.empleado_id = c.empleado_id and h.tipo = 'salario' and h.fecha = c.fecha_vigencia
                    and h.valor_nuevo = c.salario::text || ' ' || c.moneda || ' ' || c.periodicidad);

-- Desvinculaciones ya registradas
insert into public.historial_empleado (empleado_id, empresa_id, tipo, valor_anterior, detalle, fecha)
select e.id, e.empresa_id, 'desvinculacion', e.puesto, e.motivo_desvinculacion, coalesce(e.fecha_desvinculacion, current_date)
from public.empleados e
where e.estado_contratacion = 'desvinculado'
  and not exists (select 1 from public.historial_empleado h where h.empleado_id = e.id and h.tipo = 'desvinculacion');
