// Tipos y cliente (navegador) de /api/importacion.
import { supabase } from './supabase'
import type { AccionFila, OpcionesImportacion } from './importacion'
import type { Decisiones, LibroCarga } from './estructura'
import type { NivelCargo, Periodicidad, RangoSalarialCargo } from './tipos'

export interface ContextoImportacionApi {
  monedaPrincipal: string;
  salarios: { empleado_id: number; salario: number; moneda: string; periodicidad: Periodicidad; fecha_vigencia: string }[];
  potencialEvaluadoIds: number[];
  niveles: NivelCargo[];
  rangos: RangoSalarialCargo[];
  /** true si aún no se aplicó la migración 20261119 (cargos con área, niveles, rangos) */
  migracionPendiente: boolean;
}

/** Filas que el Admin vio válidas y aprobó: claves de áreas y cargos, y correos de colaboradores */
export interface ConfirmadosCarga { areas: string[]; cargos: string[]; colaboradores: string[] }

export interface ResultadoFila { numero: number; email: string; nombre: string; accion: AccionFila; ok: boolean; mensaje?: string; empleadoId?: number }
export interface ResultadoAplicacion {
  resultados: ResultadoFila[];
  creadosIds: number[];
  puestosCreados: string[];
  areasCreadas: string[];
  nivelesCreados: string[];
  areasAplicadas: number;
  cargosAplicados: number;
  /** Problemas al escribir áreas, cargos o líderes (el resto de la carga sí se aplicó) */
  avisosEstructura: string[];
}

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

export const aplicarImportacion = (libro: LibroCarga, opciones: OpcionesImportacion, decisiones: Decisiones, confirmados: ConfirmadosCarga) =>
  llamar<ResultadoAplicacion>({ method: 'POST', body: JSON.stringify({ libro, opciones, decisiones, confirmados }) });
