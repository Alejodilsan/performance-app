// Tipos y cliente (navegador) de /api/bi.
import { supabase } from './supabase'
import type { CeldaId, ConfiguracionBI, FiltrosBI, Rotacion, SenalesSalariales } from './bi'
import type { SenalesHistorial } from './historial'

export interface TotalCosto { personas: number; base: number; costoEmpresa: number }

export interface CostosBI {
  moneda: string;
  factor: number;
  /** Personas del alcance filtrado con salario vigente en la moneda principal */
  total: TotalCosto;
  sinSalario: number;
  otrasMonedas: { moneda: string; personas: number; base: number }[];
  porArea: (TotalCosto & { areaId: number | null; nombre: string; cumplimientoPromedio: number; headcount: number })[];
  porCelda: Partial<Record<CeldaId | 'sin_clasificar', TotalCosto>>;
  bajoDesempeno: TotalCosto;
  talentoClave: TotalCosto;
}

export interface RespuestaBI {
  config: ConfiguracionBI;
  /** true si la tabla de configuración aún no existe (falta la migración) y se usan valores por defecto */
  configPorDefecto: boolean;
  puedeEditarConfig: boolean;
  /** Personas (del alcance filtrado) con al menos una evaluación de potencial registrada */
  potencialEvaluadoIds: number[];
  /** null = este usuario no puede ver costos (Auditor o colaborador sin equipo) */
  costos: CostosBI | null;
  /** Solo Admin: señales individuales de salario para la retención */
  senalesSalariales: Record<number, SenalesSalariales> | null;
  /** Señales del historial laboral por colaborador (vacío si aún no existe la tabla de historial) */
  senalesHistorial: Record<number, SenalesHistorial>;
  rotacion: Rotacion;
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  return session.access_token;
}

export async function cargarBI(filtros: FiltrosBI): Promise<RespuestaBI> {
  const params = new URLSearchParams();
  if (filtros.areaId !== null) params.set('area', String(filtros.areaId));
  if (filtros.sede) params.set('sede', filtros.sede);
  if (filtros.contrato) params.set('contrato', filtros.contrato);
  const res = await fetch(`/api/bi?${params}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as RespuestaBI;
}

export async function guardarConfiguracionBI(config: ConfiguracionBI): Promise<void> {
  const res = await fetch('/api/bi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ config }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
}
