-- Estado de acceso a la plataforma y vínculo empleado ↔ cuenta de acceso.
-- Ejecutar una vez en Supabase → SQL Editor (después de 20261114_estado_contratacion.sql).
--
--   sin_invitar : el colaborador existe pero aún no tiene cuenta
--   invitado    : se le generó una clave temporal (o, a futuro, se le envió un correo) y no ha entrado
--   activo      : ya entró y creó su propia contraseña

alter table public.empleados
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists estado_acceso text not null default 'sin_invitar',
  add column if not exists fecha_invitacion timestamptz,
  add column if not exists fecha_activacion timestamptz;

alter table public.empleados drop constraint if exists empleados_estado_acceso_check;
alter table public.empleados
  add constraint empleados_estado_acceso_check
  check (estado_acceso in ('sin_invitar', 'invitado', 'activo'));

create index if not exists empleados_user_id_idx on public.empleados (user_id);

-- 1. Vincular las cuentas que ya existen (creadas con el flujo anterior) y deducir su estado
update public.empleados e
set user_id = p.id,
    estado_acceso = case when u.last_sign_in_at is not null then 'activo' else 'invitado' end,
    fecha_invitacion = coalesce(e.fecha_invitacion, u.created_at),
    fecha_activacion = case when u.last_sign_in_at is not null then coalesce(e.fecha_activacion, u.last_sign_in_at) end
from public.perfiles p
join auth.users u on u.id = p.id
where lower(p.email) = lower(e.email)
  and p.empresa_id = e.empresa_id
  and e.user_id is null;

-- 2. A partir de ahora el "Tipo de Perfil" del colaborador define su rol de acceso.
--    Para no quitarle permisos a nadie, se alinea el tipo de perfil con los roles con privilegios que ya existen.
update public.empleados e
set tipo_perfil = case p.rol
                    when 'admin'   then 'Admin'
                    when 'manager' then 'Manager'
                    when 'auditor' then 'Auditor'
                  end
from public.perfiles p
where lower(p.email) = lower(e.email)
  and p.empresa_id = e.empresa_id
  and p.rol in ('admin', 'manager', 'auditor')
  and e.tipo_perfil is distinct from (case p.rol when 'admin' then 'Admin' when 'manager' then 'Manager' when 'auditor' then 'Auditor' end);
