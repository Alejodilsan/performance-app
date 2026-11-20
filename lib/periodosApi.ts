// Cliente (navegador) de /api/resultados y /api/periodos.
import { supabase } from './supabase'

export interface RespuestaResultado { progreso: number; cumplimiento_general: number; cumplimiento_periodo: number | null }
export interface RespuestaCierre { periodo: string; registrados: number; sinResultados: string[]; pendientes: number }

async function llamar<T>(ruta: string, cuerpo: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  const res = await fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as T;
}

/** resultado = null borra la calificación del mes */
export const calificarKpi = (indicador_id: number, periodo: string, resultado: number | null) =>
  llamar<RespuestaResultado>('/api/resultados', { indicador_id, periodo, resultado });

export const cerrarPeriodo = (periodo: string) => llamar<RespuestaCierre>('/api/periodos', { accion: 'cerrar', periodo });
export const reabrirPeriodo = (periodo: string, motivo: string) => llamar<{ ok: true }>('/api/periodos', { accion: 'reabrir', periodo, motivo });

/** Pesos de todos los KPIs de una persona: { [indicadorId]: peso | null } (todos null = pesan igual) */
export const guardarPesosKpi = (empleado_id: number, pesos: Record<number, number | null>) =>
  llamar<{ cumplimiento_general: number; cumplimiento_periodo: number | null }>('/api/pesos', { empleado_id, pesos });
