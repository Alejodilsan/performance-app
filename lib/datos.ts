// Tipos y cliente (navegador) de /api/datos: los datos que cada usuario puede ver según su alcance.
import { supabase } from './supabase'
import type { Alcance } from './alcance'
import type { UmbralesDesempeno } from './bi'
import type { Area, Empleado, Evaluacion, NivelCargo, Perfil, Puesto } from './tipos'

/** Datos mínimos de todos los colaboradores activos, para el organigrama informativo (sin desempeño). */
export interface EntradaDirectorio {
  id: number;
  nombre: string;
  puesto: string;
  area_id: number | null;
  jefe_directo_id: number | null;
}

export type RespuestaDatos =
  | { estado: 'ok'; perfil: Perfil; nombreEmpresa: string; miEmpleado: Empleado | null; alcance: Alcance;
      areas: Area[]; puestos: Puesto[]; niveles: NivelCargo[];
      /** Ficha completa (KPIs, planes, histórico) de las personas que puede ver. Admin: toda la empresa, incluidos desvinculados. */
      empleados: Empleado[];
      evaluaciones: Evaluacion[];
      directorio: EntradaDirectorio[];
      monedaPreferida: string | null;
      /** Umbrales de desempeño de la empresa (configurables en el BI) */
      umbrales: UmbralesDesempeno;
      /** Períodos (mes 'AAAA-MM'): cerrados, días límite para calificar y si la migración 20261121 está aplicada */
      periodos: InfoPeriodos }
  | { estado: 'desvinculado' }
  | { estado: 'sin_perfil' };

export interface InfoPeriodos { cerrados: string[]; diasLimite: number; disponible: boolean }

export async function cargarDatosSesion(): Promise<RespuestaDatos> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  const res = await fetch('/api/datos', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as RespuestaDatos;
}
