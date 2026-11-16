// Tipos y cliente (navegador) de /api/importacion.
import { supabase } from './supabase'
import type { AccionFila, FilaArchivo, OpcionesImportacion } from './importacion'
import type { Periodicidad } from './tipos'

export interface ContextoImportacionApi {
  monedaPrincipal: string;
  salarios: { empleado_id: number; salario: number; moneda: string; periodicidad: Periodicidad; fecha_vigencia: string }[];
  potencialEvaluadoIds: number[];
}

export interface ResultadoFila { numero: number; email: string; nombre: string; accion: AccionFila; ok: boolean; mensaje?: string; empleadoId?: number }
export interface ResultadoAplicacion { resultados: ResultadoFila[]; creadosIds: number[]; puestosCreados: string[]; areasCreadas: string[] }

async function llamar<T>(init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  const res = await fetch('/api/importacion', {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as T;
}

export const cargarContextoImportacion = () => llamar<ContextoImportacionApi>();

export const aplicarImportacion = (filas: FilaArchivo[], opciones: OpcionesImportacion, confirmados: string[]) =>
  llamar<ResultadoAplicacion>({ method: 'POST', body: JSON.stringify({ filas, opciones, confirmados }) });
