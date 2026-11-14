// ⚠️ Solo para rutas de servidor (app/api/**). Usa la service role key: nunca importar desde componentes.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Perfil } from '@/lib/tipos'

export function crearClienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const errorJson = (mensaje: string, status: number) => NextResponse.json({ mensaje }, { status });

/** Valida el token "Authorization: Bearer <jwt>" que envía el navegador y devuelve el usuario. */
export async function usuarioDesdeRequest(request: Request, admin: SupabaseClient): Promise<User | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

/**
 * Exige que quien llama tenga sesión y sea admin. La empresa se toma de SU perfil en la base de datos,
 * nunca de lo que mande el navegador.
 */
export async function exigirAdmin(request: Request):
  Promise<{ ok: true; admin: SupabaseClient; usuario: User; perfil: Perfil } | { ok: false; respuesta: NextResponse }> {
  let admin: SupabaseClient;
  try { admin = crearClienteAdmin(); }
  catch (e) {
    console.error(e);
    return { ok: false, respuesta: errorJson('Error de configuración del servidor.', 500) };
  }

  const usuario = await usuarioDesdeRequest(request, admin);
  if (!usuario) return { ok: false, respuesta: errorJson('Sesión no válida. Vuelve a iniciar sesión.', 401) };

  const { data: perfil } = await admin.from('perfiles').select('*').eq('id', usuario.id).single();
  if (!perfil || perfil.rol !== 'admin' || !perfil.empresa_id) {
    return { ok: false, respuesta: errorJson('Solo un administrador puede realizar esta acción.', 403) };
  }
  return { ok: true, admin, usuario, perfil };
}
