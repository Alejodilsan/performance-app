// Alcance de visibilidad según la jerarquía de áreas. Función pura: la usan el servidor (/api/datos) y el navegador.
import type { Area, Perfil } from './tipos'
import { idsDescendientes } from './jerarquia'

export type TipoAlcance = 'empresa' | 'equipo' | 'personal';

export interface Alcance {
  /** empresa: Admin/Auditor · equipo: lidera áreas o tiene reportes · personal: solo su propia información */
  tipo: TipoAlcance;
  /** Áreas que ve en el tablero: las que lidera + todas sus sub-áreas (vacío si tipo = 'empresa': ve todas) */
  areasIds: number[];
  /** Colaboradores de su equipo (cascada completa), sin incluirse a sí mismo */
  equipoIds: number[];
  /** Reportes directos: los únicos que puede editar (calificar KPIs, planes, potencial) */
  directosIds: number[];
}

interface EmpleadoMinimo { id: number; area_id: number | null; jefe_directo_id?: number | null }

/**
 * Reglas (iguales para todos los perfiles, según la jerarquía):
 *  - Admin y Auditor ven toda la empresa.
 *  - Quien lidera un área ve esa área y todas sus sub-áreas (cascada), más quienes lo tengan como jefe directo (también en cascada).
 *  - Sus reportes DIRECTOS son: los miembros de las áreas que lidera, los líderes de las sub-áreas inmediatas
 *    y quienes lo tengan como jefe directo. Solo a ellos puede editarlos; el resto de la cascada es de solo lectura.
 *  - Quien no lidera a nadie solo ve su propia información.
 */
export function calcularAlcance(rol: Perfil['rol'] | undefined, miId: number | null, areas: Area[], activos: EmpleadoMinimo[]): Alcance {
  if (rol === 'admin' || rol === 'auditor') {
    return { tipo: 'empresa', areasIds: [], equipoIds: activos.map(e => e.id).filter(id => id !== miId), directosIds: [] };
  }
  if (miId === null) return { tipo: 'personal', areasIds: [], equipoIds: [], directosIds: [] };

  // 1. Áreas que lidera y toda su descendencia
  const areasRaiz = areas.filter(a => a.lider_id === miId);
  const areasIds = new Set<number>(areasRaiz.map(a => a.id));
  areasRaiz.forEach(a => idsDescendientes(a.id, areas).forEach(id => areasIds.add(id)));

  // 2. Equipo: miembros de esas áreas + cadena de jefe directo (cascada)
  const equipo = new Set<number>(activos.filter(e => e.area_id !== null && areasIds.has(e.area_id)).map(e => e.id));
  let frontera = [miId];
  const visitados = new Set<number>([miId]);
  while (frontera.length > 0) {
    const reportes = activos.filter(e => e.jefe_directo_id != null && frontera.includes(e.jefe_directo_id) && !visitados.has(e.id));
    reportes.forEach(e => { equipo.add(e.id); visitados.add(e.id); });
    frontera = reportes.map(e => e.id);
  }
  equipo.delete(miId);

  // 3. Reportes directos
  const directosIds = reportesDirectos(miId, areas, activos);

  const tipo: TipoAlcance = areasIds.size > 0 || equipo.size > 0 ? 'equipo' : 'personal';
  return { tipo, areasIds: [...areasIds], equipoIds: [...equipo], directosIds };
}

/**
 * Reportes DIRECTOS de una persona: miembros de las áreas que lidera, líderes de sus sub-áreas inmediatas y
 * quienes la tienen como jefe directo (solo activos). Es la misma regla para cualquier nivel de la jerarquía.
 */
export function reportesDirectos(miId: number, areas: Area[], activos: EmpleadoMinimo[]): number[] {
  const idsRaiz = new Set(areas.filter(a => a.lider_id === miId).map(a => a.id));
  const directos = new Set<number>();
  activos.forEach(e => {
    if (e.id === miId) return;
    if (e.area_id !== null && idsRaiz.has(e.area_id)) directos.add(e.id);
    if (e.jefe_directo_id === miId) directos.add(e.id);
  });
  areas.forEach(sub => {
    if (sub.parent_id !== null && idsRaiz.has(sub.parent_id) && sub.lider_id && sub.lider_id !== miId) directos.add(sub.lider_id);
  });
  const activosIds = new Set(activos.map(e => e.id));
  return [...directos].filter(id => activosIds.has(id));
}
