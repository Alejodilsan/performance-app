// Cliente (navegador) de /api/desarrollo: plan de desarrollo individual (PDI 70-20-10) y check-ins.
import { supabase } from './supabase'
import type { CheckinPDI, EstadoObjetivo, ObjetivoPDI, TipoAccion } from './desarrollo'
import type { PersonaMin } from './evaluacion360Api'

export interface PlanPersona {
  persona: PersonaMin;
  objetivos: ObjetivoPDI[];
  checkins: CheckinPDI[];
  /** Competencias del último informe 360 que quien consulta puede ver (null si no hay o no tiene acceso) */
  sugerencias: { ciclo: { id: number; nombre: string }; competencias: { id: number; nombre: string; final: number | null; sugerida: boolean; motivo: string | null }[] } | null;
  permisos: { editar: boolean; propio: boolean };
  mesActual: string;
}

export interface ResumenDesarrollo {
  mesActual: string;
  personas: {
    persona: PersonaMin; objetivos: number; logrados: number; avance: number | null;
    ultimoCheckin: string | null; estadoCheckin: 'al_dia' | 'pendiente' | 'atrasado' | null; editable: boolean; propio: boolean;
  }[];
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  return session.access_token;
}

async function obtener<T>(query: string): Promise<T> {
  const res = await fetch(`/api/desarrollo${query}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as T;
}

export const cargarResumenDesarrollo = () => obtener<ResumenDesarrollo>('');
export const cargarPlan = (empleadoId: number) => obtener<PlanPersona>(`?empleado=${empleadoId}`);

async function accion(cuerpo: Record<string, unknown>) {
  const res = await fetch('/api/desarrollo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as { id?: number };
}

export interface DatosObjetivoPDI {
  id?: number; empleado_id: number; titulo: string; resultado_esperado: string; fecha_limite: string | null;
  ciclo_id: number | null; competencia_id: number | null; competencia: string | null;
}
export const guardarObjetivoPDI = (d: DatosObjetivoPDI) => accion({ accion: 'guardar_objetivo', ...d });
export const estadoObjetivoPDI = (id: number, estado: EstadoObjetivo) => accion({ accion: 'estado_objetivo', id, estado });
export const eliminarObjetivoPDI = (id: number) => accion({ accion: 'eliminar_objetivo', id });
export const guardarAccionPDI = (d: { id?: number; objetivo_id?: number; tipo: TipoAccion; descripcion: string; fecha_limite: string | null }) => accion({ accion: 'guardar_accion', ...d });
export const marcarAccionPDI = (id: number, completada: boolean) => accion({ accion: 'marcar_accion', id, completada });
export const eliminarAccionPDI = (id: number) => accion({ accion: 'eliminar_accion', id });
export const registrarCheckin = (empleado_id: number, comentario: string, proximos_pasos: string) => accion({ accion: 'registrar_checkin', empleado_id, comentario, proximos_pasos });
