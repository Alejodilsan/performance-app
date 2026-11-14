-- Ficha completa del colaborador + compensación (salario) con historial.
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261115_accesos.sql).

-- =====================================================================
-- 1. Datos personales y laborales en empleados
-- =====================================================================
alter table public.empleados
  -- Personales
  add column if not exists tipo_documento   text,
  add column if not exists numero_documento text,
  add column if not exists fecha_nacimiento date,
  add column if not exists telefono         text,
  add column if not exists email_personal   text,
  -- Laborales
  add column if not exists fecha_ingreso    date,
  add column if not exists jefe_directo_id  bigint references public.empleados(id) on delete set null,
  add column if not exists sede             text,
  add column if not exists tipo_contrato    text,
  add column if not exists modalidad        text,
  add column if not exists jornada          text,
  add column if not exists centro_costo     text;

alter table public.empleados drop constraint if exists empleados_tipo_contrato_check;
alter table public.empleados add constraint empleados_tipo_contrato_check
  check (tipo_contrato is null or tipo_contrato in ('indefinido', 'fijo', 'obra_labor', 'aprendizaje', 'practicas', 'prestacion_servicios'));

alter table public.empleados drop constraint if exists empleados_modalidad_check;
alter table public.empleados add constraint empleados_modalidad_check
  check (modalidad is null or modalidad in ('presencial', 'remoto', 'hibrido'));

alter table public.empleados drop constraint if exists empleados_jornada_check;
alter table public.empleados add constraint empleados_jornada_check
  check (jornada is null or jornada in ('completa', 'parcial', 'por_horas'));

alter table public.empleados drop constraint if exists empleados_jefe_no_es_si_mismo;
alter table public.empleados add constraint empleados_jefe_no_es_si_mismo
  check (jefe_directo_id is null or jefe_directo_id <> id);

-- Un documento no puede repetirse dentro de la misma empresa
create unique index if not exists empleados_documento_unico_idx
  on public.empleados (empresa_id, tipo_documento, numero_documento)
  where numero_documento is not null;

create index if not exists empleados_jefe_directo_idx on public.empleados (jefe_directo_id);

-- =====================================================================
-- 2. Compensación: tabla aparte, solo visible para Admins de la empresa
--    Cada cambio de salario es una fila nueva (historial). El vigente es el de fecha_vigencia más reciente.
-- =====================================================================
create table if not exists public.compensaciones (
  id             bigint generated always as identity primary key,
  empleado_id    bigint not null references public.empleados(id) on delete cascade,
  empresa_id     bigint not null,
  salario        numeric(14, 2) not null check (salario > 0),
  moneda         text not null default 'COP',
  periodicidad   text not null default 'mensual' check (periodicidad in ('mensual', 'anual', 'por_hora')),
  fecha_vigencia date not null default current_date,
  motivo         text,
  creado_por     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists compensaciones_empleado_idx on public.compensaciones (empleado_id, fecha_vigencia desc);

-- ¿El usuario actual es Admin de esa empresa? (security definer para no depender de las políticas de perfiles)
create or replace function public.es_admin_de_empresa(p_empresa_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and empresa_id = p_empresa_id
  );
$$;

alter table public.compensaciones enable row level security;

drop policy if exists compensaciones_admin_select on public.compensaciones;
drop policy if exists compensaciones_admin_insert on public.compensaciones;
drop policy if exists compensaciones_admin_update on public.compensaciones;
drop policy if exists compensaciones_admin_delete on public.compensaciones;

create policy compensaciones_admin_select on public.compensaciones
  for select to authenticated using (public.es_admin_de_empresa(empresa_id));

create policy compensaciones_admin_insert on public.compensaciones
  for insert to authenticated with check (
    public.es_admin_de_empresa(empresa_id)
    -- el colaborador debe pertenecer a esa misma empresa
    and exists (select 1 from public.empleados e where e.id = empleado_id and e.empresa_id = compensaciones.empresa_id)
  );

create policy compensaciones_admin_update on public.compensaciones
  for update to authenticated using (public.es_admin_de_empresa(empresa_id)) with check (public.es_admin_de_empresa(empresa_id));

create policy compensaciones_admin_delete on public.compensaciones
  for delete to authenticated using (public.es_admin_de_empresa(empresa_id));
