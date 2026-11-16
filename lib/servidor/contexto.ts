// ⚠️ Solo servidor. Contexto común de las rutas que entregan datos según el alcance del usuario.
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { crearClienteAdmin, usuarioDesdeRequest } from './supabaseAdmin'
import { calcularAlcance, type Alcance } from '@/lib/alcance'
import { estaActivo, type Area, type Empleado, type Perfil } from '@/lib/tipos'

export type ContextoSesion =
  | { estado: 'ok'; admin: SupabaseClient; usuario: User; perfil: Perfil; empresaId: number;
      areas: Area[]; todos: Empleado[]; activos: Empleado[]; miBase: Empleado | null; alcance: Alcance }
  | { estado: 'sin_sesion' }
  | { estado: 'sin_perfil' }
  | { estado: 'desvinculado' };

/** Valida la sesión, carga perfil, áreas y colaboradores (sin KPIs) de su empresa y calcula su alcance. */
export async function obtenerContextoSesion(request: Request): Promise<ContextoSesion> {
  const admin = crearClienteAdmin();
  const usuario = await usuarioDesdeRequest(request, admin);
  if (!usuario) return { estado: 'sin_sesion' };

  const { data: perfil } = await admin.from('perfiles').select('*').eq('id', usuario.id).maybeSingle<Perfil>();
  if (!perfil?.empresa_id) return { estado: 'sin_perfil' };
  const empresaId = perfil.empresa_id;

  const [{ data: areasDB }, { data: todosDB, error }] = await Promise.all([
    admin.from('areas').select('*').eq('empresa_id', empresaId).order('id'),
    admin.from('empleados').select('*').eq('empresa_id', empresaId).order('id'),
  ]);
  if (error) throw error;
  const areas = (areasDB || []) as Area[];
  const todos = (todosDB || []) as Empleado[];

  // Su ficha: por cuenta vinculada o por correo (sin distinguir mayúsculas)
  const email = (usuario.email || '').trim().toLowerCase();
  const miBase = todos.find(e => e.user_id === usuario.id) || todos.find(e => e.email?.trim().toLowerCase() === email) || null;
  if (miBase && !estaActivo(miBase)) return { estado: 'desvinculado' };

  const activos = todos.filter(estaActivo);
  const alcance = calcularAlcance(perfil.rol, miBase?.id ?? null, areas, activos);
  return { estado: 'ok', admin, usuario, perfil, empresaId, areas, todos, activos, miBase, alcance };
}

const LOTE = 150; // ids por consulta (evita URLs demasiado largas)

export async function porLotes<T>(ids: number[], consulta: (lote: number[]) => Promise<T[]>): Promise<T[]> {
  const resultado: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    if (lote.length > 0) resultado.push(...(await consulta(lote)));
  }
  return resultado;
}
