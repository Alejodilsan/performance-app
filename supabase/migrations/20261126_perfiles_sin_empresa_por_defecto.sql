-- Un perfil nunca debe caer en una empresa por omisión: perfiles.empresa_id tenía "default 1", así que cualquier
-- perfil creado sin indicar la empresa quedaba dentro de la empresa 1. Ejecutar una vez en Supabase → SQL Editor.
-- No cambia ningún dato existente; todo el código ya envía empresa_id de forma explícita.
alter table public.perfiles alter column empresa_id drop default;
