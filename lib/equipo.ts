// Vista "Mi equipo" del inicio: jerarquía por personas (zoom por niveles) y métricas del mes. Funciones puras.
import type { Area, Empleado } from './tipos'
import { calcularAlcance, reportesDirectos } from './alcance'
import { claveMes, etiquetaMes, resumenPeriodo, sumarMeses } from './periodos'

export interface MetricasPersona {
  /** Cumplimiento del mes en curso (KPIs calificados); null si aún no tiene calificaciones */
  personal: number | null;
  /** Diferencia con el mes anterior (puntos), si ambos existen */
  tendencia: number | null;
  /** KPIs del mes sin calificar (de la persona) */
  pendientes: number;
  /** Reportes directos (ids) */
  directos: number[];
  /** Promedio del mes de sus reportes directos */
  equipo: number | null;
  /** Toda su rama en cascada: promedio del mes, personas y KPIs por calificar */
  rama: number | null;
  nRama: number;
  pendientesRama: number;
}

const promedio = (v: (number | null)[]) => {
  const n = v.filter((x): x is number => x !== null);
  return n.length ? Math.round(n.reduce((s, x) => s + x, 0) / n.length) : null;
};

/** Calcula las métricas del mes de cada persona visible (memorizar por lista de empleados). */
export function metricasDelMes(empleados: Empleado[], areas: Area[], clave = claveMes()): Map<number, MetricasPersona> {
  const anterior = etiquetaMes(sumarMeses(clave, -1));
  const base = new Map(empleados.map(e => {
    const r = resumenPeriodo(e, clave);
    const previo = (e.historico || []).find(h => h.periodo === anterior);
    return [e.id, { personal: r.cumplimiento, pendientes: r.pendientes.length, previo: previo ? Number(previo.cumplimiento) : null }];
  }));
  const visibles = new Set(empleados.map(e => e.id));
  const m = new Map<number, MetricasPersona>();
  empleados.forEach(e => {
    const b = base.get(e.id)!;
    const directos = reportesDirectos(e.id, areas, empleados).filter(id => visibles.has(id));
    const rama = calcularAlcance(undefined, e.id, areas, empleados).equipoIds.filter(id => visibles.has(id));
    m.set(e.id, {
      personal: b.personal,
      tendencia: b.personal !== null && b.previo !== null ? Math.round(b.personal - b.previo) : null,
      pendientes: b.pendientes,
      directos,
      equipo: promedio(directos.map(id => base.get(id)?.personal ?? null)),
      rama: promedio(rama.map(id => base.get(id)?.personal ?? null)),
      nRama: rama.length,
      pendientesRama: rama.reduce((s, id) => s + (base.get(id)?.pendientes ?? 0), 0),
    });
  });
  return m;
}

/**
 * Primer nivel de la vista: los reportes directos de quien mira; si no lidera a nadie (Admin/Auditor),
 * la cima de la organización: los líderes de las áreas principales (o sus miembros si el área no tiene líder).
 */
export function primerNivel(miId: number | null, empleados: Empleado[], areas: Area[]): number[] {
  if (miId !== null) {
    const directos = reportesDirectos(miId, areas, empleados);
    if (directos.length > 0) return directos;
  }
  const ids = new Set<number>();
  areas.filter(a => a.parent_id === null).forEach(a => {
    if (a.lider_id && empleados.some(e => e.id === a.lider_id)) ids.add(a.lider_id);
    else empleados.filter(e => e.area_id === a.id).forEach(e => ids.add(e.id));
  });
  ids.delete(miId ?? -1);
  return [...ids];
}

/** Orden de las tarjetas: primero quienes lideran un equipo, luego por nombre. */
export function ordenarEquipo(ids: number[], empleados: Empleado[], metricas: Map<number, MetricasPersona>): Empleado[] {
  return ids.map(id => empleados.find(e => e.id === id)).filter((e): e is Empleado => !!e)
    .sort((a, b) => (metricas.get(b.id)?.directos.length ? 1 : 0) - (metricas.get(a.id)?.directos.length ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
}
