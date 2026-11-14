// Cliente (navegador) de la API de accesos. Envía siempre el token de la sesión actual.
import { supabase } from './supabase'

export type EstadoAcceso = 'sin_invitar' | 'invitado' | 'activo';

export interface AccesoOtorgado { empleado_id: number; nombre: string; email: string; clave_temporal: string; cuenta_nueva: boolean }
export interface ErrorAcceso { empleado_id: number; nombre: string; mensaje: string }
export interface ResultadoOtorgar { otorgados: AccesoOtorgado[]; errores: ErrorAcceso[] }

async function llamarApi<T>(ruta: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  const res = await fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as T;
}

/** Crea la cuenta (o restablece la clave) y devuelve las claves temporales. Solo se muestran una vez. */
export const otorgarAccesos = (empleadoIds: number[]) =>
  llamarApi<ResultadoOtorgar>('/api/accesos', { accion: 'otorgar', empleadoIds, metodo: 'clave_temporal' });

export const sincronizarRol = (empleadoId: number) =>
  llamarApi<{ ok: true }>('/api/accesos', { accion: 'sincronizar_rol', empleadoId });

export const revocarAcceso = (empleadoId: number) =>
  llamarApi<{ ok: true }>('/api/accesos', { accion: 'revocar', empleadoId });

export const restaurarAcceso = (empleadoId: number) =>
  llamarApi<{ ok: true }>('/api/accesos', { accion: 'restaurar', empleadoId });

/** El propio usuario confirma que ya reemplazó su clave temporal. */
export const activarMiCuenta = () => llamarApi<{ ok: true }>('/api/accesos/activar');

export const debeCambiarClave = (appMetadata: Record<string, unknown> | undefined) => appMetadata?.debe_cambiar_clave === true;

export const ETIQUETA_ESTADO_ACCESO: Record<EstadoAcceso, { texto: string; clase: string }> = {
  sin_invitar: { texto: 'Sin acceso', clase: 'bg-slate-100 text-slate-500 border-slate-200' },
  invitado: { texto: 'Clave temporal', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  activo: { texto: 'Activo', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
