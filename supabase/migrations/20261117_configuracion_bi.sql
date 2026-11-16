-- Configuración del módulo BI por empresa: moneda, costo empresa y umbrales de desempeño.
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261116_ficha_colaborador.sql).
-- Valores por defecto: Colombia (COP, factor prestacional 1,52, 182 horas/mes = 42 h/semana).

create table if not exists public.configuracion_empresa (
  empresa_id            bigint primary key,
  moneda_principal      text          not null default 'COP',
  factor_prestacional   numeric(5, 3) not null default 1.52 check (factor_prestacional >= 1 and factor_prestacional <= 3),
  horas_mes             numeric(6, 2) not null default 182  check (horas_mes > 0 and horas_mes <= 400),
  umbral_desempeno_bajo integer       not null default 60   check (umbral_desempeno_bajo between 1 and 99),
  umbral_desempeno_alto integer       not null default 85   check (umbral_desempeno_alto between 2 and 100),
  updated_at            timestamptz   not null default now(),
  constraint configuracion_umbrales_orden check (umbral_desempeno_bajo < umbral_desempeno_alto)
);

-- La app la lee y escribe desde el servidor (/api/bi) con la service role.
-- RLS activado sin políticas públicas: ningún cliente puede leerla ni modificarla directamente.
alter table public.configuracion_empresa enable row level security;

-- Índices de apoyo para los cálculos del BI
create index if not exists evaluaciones_potencial_empleado_idx on public.evaluaciones_potencial (empleado_id);
create index if not exists empleados_empresa_estado_area_idx on public.empleados (empresa_id, estado_contratacion, area_id);
