-- Estado de contratación de los colaboradores.
-- Un colaborador que deja la organización NO se elimina: se marca como 'desvinculado'
-- para conservar su histórico (KPIs, planes, evaluaciones, historico_cumplimiento).
--
-- Ejecutar una vez en Supabase → SQL Editor.

alter table public.empleados
  add column if not exists estado_contratacion text not null default 'activo',
  add column if not exists fecha_desvinculacion date,
  add column if not exists motivo_desvinculacion text;

alter table public.empleados
  drop constraint if exists empleados_estado_contratacion_check;

alter table public.empleados
  add constraint empleados_estado_contratacion_check
  check (estado_contratacion in ('activo', 'desvinculado'));

create index if not exists empleados_empresa_estado_idx
  on public.empleados (empresa_id, estado_contratacion);
