// Cliente (navegador) de /api/historial.
import { supabase } from './supabase'
import type { EventoHistorial } from './historial'

export type RespuestaHistorial =
  | { estado: 'ok'; eventos: EventoHistorial[]; incluyeSalarios: boolean }
  | { estado: 'migracion_pendiente' };

export async function cargarHistorial(empleadoId: number): Promise<RespuestaHistorial> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  const res = await fetch(`/api/historial?empleado=${empleadoId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as RespuestaHistorial;
}
