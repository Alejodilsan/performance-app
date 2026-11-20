// Cliente (navegador) de /api/okr.
import { supabase } from './supabase'
import type { ObjetivoOKR, ResultadoClave, TipoMedicion } from './okr'

export interface RespuestaOKR {
  anio: number;
  trimestre: number;
  objetivos: ObjetivoOKR[];
  krs: ResultadoClave[];
  /** Avance (0–100 o null) en el trimestre consultado */
  avance: { kr: Record<number, number | null>; objetivo: Record<number, number | null> };
  /** KPIs vinculados por KR: totales de toda la empresa y detalle solo de las personas en tu alcance */
  kpisPorKr: Record<number, { total: number; conAvance: number; visibles: { id: number; titulo: string; persona: string; progreso: number | null }[] }>;
  /** KPIs de personas activas y cuántos aportan a un OKR */
  alineacion: { total: number; alineados: number };
  /** Niveles que puede gestionar: empresa (Admin) y áreas (Admin: todas; líder: la suya) */
  permisos: { empresa: boolean; areas: number[] };
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  return session.access_token;
}

export async function cargarOKR(anio: number, trimestre: number): Promise<RespuestaOKR> {
  const res = await fetch(`/api/okr?anio=${anio}&trimestre=${trimestre}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as RespuestaOKR;
}

export interface DatosObjetivo { id?: number; area_id?: number | null; anio?: number; titulo: string; descripcion?: string | null; kr_padre_id?: number | null; responsable_id?: number | null }
export interface DatosKr { id?: number; objetivo_id?: number; titulo: string; trimestre: number; tipo_medicion: TipoMedicion; meta: number | null; valor_inicial: number; unidad?: string | null; direccion: 'creciente' | 'decreciente' }

async function accion(cuerpo: Record<string, unknown>) {
  const res = await fetch('/api/okr', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
}

export const guardarObjetivo = (d: DatosObjetivo) => accion({ accion: d.id ? 'editar_objetivo' : 'crear_objetivo', ...d });
export const eliminarObjetivo = (id: number) => accion({ accion: 'eliminar_objetivo', id });
export const guardarKr = (d: DatosKr) => accion({ accion: d.id ? 'editar_kr' : 'crear_kr', ...d });
export const eliminarKr = (id: number) => accion({ accion: 'eliminar_kr', id });
export const actualizarKr = (id: number, resultado_actual: number | null) => accion({ accion: 'actualizar_kr', id, resultado_actual });
