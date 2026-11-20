// OKR en cascada Empresa → Área → Persona. Funciones puras (servidor y navegador).
//
//  * Objetivo: anual. area_id null = de la empresa. Un objetivo de área se alinea (kr_padre_id) a un KR del nivel
//    superior: de la empresa si el área es principal, del área superior si es sub-área.
//  * Resultado clave (KR): de un trimestre. 'medido' tiene su propia meta; 'calculado' = promedio de lo vinculado
//    (KPIs de personas con resultado en ese trimestre + objetivos de área alineados a él).
//  * Avance de un objetivo en un trimestre = promedio de sus KR de ese trimestre.
import type { Area } from './tipos'
import { calcularProgreso, type ResultadoKpi } from './periodos'

export type TipoMedicion = 'calculado' | 'medido';

export interface ObjetivoOKR {
  id: number;
  area_id: number | null;
  anio: number;
  titulo: string;
  descripcion?: string | null;
  kr_padre_id: number | null;
  responsable_id: number | null;
  orden: number;
}

export interface ResultadoClave {
  id: number;
  objetivo_id: number;
  titulo: string;
  trimestre: 1 | 2 | 3 | 4;
  tipo_medicion: TipoMedicion;
  valor_inicial: number;
  meta: number | null;
  unidad?: string | null;
  direccion: 'creciente' | 'decreciente';
  resultado_actual: number | null;
  actualizado_en?: string | null;
  orden: number;
}

/** KPI vinculado a un KR, con su avance en el trimestre del KR */
export interface KpiDeKr { id: number; kr_id: number; empleado_id: number; titulo: string; progreso: number | null }

// ------------------------------------------------------------------
// Trimestres
// ------------------------------------------------------------------

export const trimestreDe = (clave: string) => Math.floor((Number(clave.slice(5, 7)) - 1) / 3) + 1 as 1 | 2 | 3 | 4;
export const mesesDelTrimestre = (anio: number, t: number) =>
  [1, 2, 3].map(i => `${anio}-${String((t - 1) * 3 + i).padStart(2, '0')}`);
export const etiquetaTrimestre = (anio: number, t: number) => `T${t} ${anio}`;

/** Avance de un KPI en un trimestre: su último resultado registrado dentro de los meses del trimestre. */
export function progresoKpiEnTrimestre(resultados: ResultadoKpi[] | undefined, anio: number, t: number): number | null {
  const meses = new Set(mesesDelTrimestre(anio, t));
  const ultimo = (resultados || []).filter(r => meses.has(r.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo)).pop();
  return ultimo ? Math.round(Number(ultimo.progreso)) : null;
}

// ------------------------------------------------------------------
// Avance
// ------------------------------------------------------------------

/** KR medido: avance desde el valor inicial hasta la meta (0–100). null si aún no tiene resultado. */
export function progresoMedido(kr: Pick<ResultadoClave, 'valor_inicial' | 'meta' | 'direccion' | 'resultado_actual'>): number | null {
  if (kr.resultado_actual === null || kr.resultado_actual === undefined || kr.meta === null) return null;
  const inicio = Number(kr.valor_inicial) || 0, meta = Number(kr.meta), actual = Number(kr.resultado_actual);
  if (meta === inicio) return calcularProgreso(kr.direccion, meta || 1, actual);
  const p = kr.direccion === 'decreciente' ? (inicio - actual) / (inicio - meta) : (actual - inicio) / (meta - inicio);
  return Math.max(0, Math.min(100, Math.round(p * 100)));
}

const promedio = (v: (number | null)[]) => {
  const n = v.filter((x): x is number => x !== null);
  return n.length ? Math.round(n.reduce((s, x) => s + x, 0) / n.length) : null;
};

export interface AvanceOKR {
  kr: Map<number, number | null>;
  objetivo: Map<number, number | null>;
}

/**
 * Avance de todo el árbol en un trimestre. Un objetivo avanza con sus KR de ese trimestre; un KR calculado,
 * con los KPIs vinculados y los objetivos alineados a él (recursivo, protegido contra ciclos).
 */
export function calcularAvance(objetivos: ObjetivoOKR[], krs: ResultadoClave[], kpis: KpiDeKr[], trimestre: number): AvanceOKR {
  const avance: AvanceOKR = { kr: new Map(), objetivo: new Map() };
  const krsDe = new Map<number, ResultadoClave[]>();
  krs.forEach(k => krsDe.set(k.objetivo_id, [...(krsDe.get(k.objetivo_id) || []), k]));
  const alineados = new Map<number, ObjetivoOKR[]>();
  objetivos.forEach(o => { if (o.kr_padre_id) alineados.set(o.kr_padre_id, [...(alineados.get(o.kr_padre_id) || []), o]); });
  const kpisDe = new Map<number, KpiDeKr[]>();
  kpis.forEach(k => kpisDe.set(k.kr_id, [...(kpisDe.get(k.kr_id) || []), k]));
  const enCurso = new Set<string>();

  const deObjetivo = (o: ObjetivoOKR): number | null => {
    if (avance.objetivo.has(o.id)) return avance.objetivo.get(o.id)!;
    if (enCurso.has(`o${o.id}`)) return null;
    enCurso.add(`o${o.id}`);
    const v = promedio((krsDe.get(o.id) || []).filter(k => k.trimestre === trimestre).map(deKr));
    avance.objetivo.set(o.id, v);
    return v;
  };
  const deKr = (k: ResultadoClave): number | null => {
    if (avance.kr.has(k.id)) return avance.kr.get(k.id)!;
    if (enCurso.has(`k${k.id}`)) return null;
    enCurso.add(`k${k.id}`);
    const v = k.tipo_medicion === 'medido'
      ? progresoMedido(k)
      : promedio([...(kpisDe.get(k.id) || []).map(x => x.progreso), ...(alineados.get(k.id) || []).map(deObjetivo)]);
    avance.kr.set(k.id, v);
    return v;
  };
  objetivos.forEach(deObjetivo);
  krs.forEach(deKr);
  return avance;
}

// ------------------------------------------------------------------
// Reglas de alineación y permisos
// ------------------------------------------------------------------

/** Nivel al que debe alinearse un objetivo del área: empresa (área principal) o el área superior. */
export function areaDeAlineacion(areaId: number, areas: Area[]): number | null {
  return areas.find(a => a.id === areaId)?.parent_id ?? null;
}

/** Error si el KR elegido no es del nivel inmediatamente superior al área. */
export function validarAlineacion(areaId: number | null, krPadre: ResultadoClave | undefined, objetivos: ObjetivoOKR[], areas: Area[], anio: number): string | null {
  if (areaId === null) return krPadre ? 'Los objetivos de la empresa no se alinean a otro resultado clave.' : null;
  if (!krPadre) return 'Elige el resultado clave al que aporta este objetivo.';
  const objPadre = objetivos.find(o => o.id === krPadre.objetivo_id);
  if (!objPadre) return 'El resultado clave elegido no existe.';
  if (objPadre.anio !== anio) return 'El resultado clave elegido es de otro año.';
  const esperado = areaDeAlineacion(areaId, areas);
  if ((objPadre.area_id ?? null) !== esperado) {
    const nombre = esperado === null ? 'la empresa' : `"${areas.find(a => a.id === esperado)?.nombre}"`;
    return `Este objetivo debe alinearse a un resultado clave de ${nombre} (nivel inmediatamente superior).`;
  }
  return null;
}

/** ¿Puede crear/editar objetivos de ese nivel? Empresa: solo Admin. Área: Admin o su líder. */
export function puedeGestionarNivel(areaId: number | null, esAdmin: boolean, miEmpleadoId: number | null, areas: Area[]): boolean {
  if (esAdmin) return true;
  if (areaId === null || miEmpleadoId === null) return false;
  return areas.find(a => a.id === areaId)?.lider_id === miEmpleadoId;
}

/** KR de un objetivo que pueden recibir objetivos alineados del área indicada. */
export function krsParaAlinear(areaId: number, objetivos: ObjetivoOKR[], krs: ResultadoClave[], areas: Area[], anio: number): ResultadoClave[] {
  const nivel = areaDeAlineacion(areaId, areas);
  const ids = new Set(objetivos.filter(o => o.anio === anio && (o.area_id ?? null) === nivel).map(o => o.id));
  return krs.filter(k => ids.has(k.objetivo_id)).sort((a, b) => a.trimestre - b.trimestre || a.orden - b.orden);
}

/** KR del área de una persona a los que puede aportar un KPI (año indicado). */
export function krsDelArea(areaId: number | null, objetivos: ObjetivoOKR[], krs: ResultadoClave[], anio: number): ResultadoClave[] {
  if (areaId === null) return [];
  const ids = new Set(objetivos.filter(o => o.anio === anio && o.area_id === areaId).map(o => o.id));
  return krs.filter(k => ids.has(k.objetivo_id)).sort((a, b) => a.trimestre - b.trimestre || a.orden - b.orden);
}

export function validarKr(d: { titulo: string; trimestre: number; tipo_medicion: TipoMedicion; meta: number | null; valor_inicial: number }): string | null {
  if (!d.titulo.trim()) return 'Escribe el resultado clave.';
  if (![1, 2, 3, 4].includes(d.trimestre)) return 'Elige el trimestre.';
  if (d.tipo_medicion === 'medido') {
    if (d.meta === null || !Number.isFinite(d.meta)) return 'Un resultado clave medido necesita una meta.';
    if (!Number.isFinite(d.valor_inicial)) return 'El valor inicial no es válido.';
  }
  return null;
}

export interface OpcionKr { id: number; etiqueta: string; trimestre: number }

/** KR del año a los que puede aportar un KPI de alguien del área (etiqueta: "T4 · Objetivo › KR"). */
export function opcionesKrDe(areaId: number | null | undefined, okr?: { objetivos: ObjetivoOKR[]; krs: ResultadoClave[] }): OpcionKr[] {
  if (!okr || areaId == null) return [];
  const anio = new Date().getFullYear();
  return krsDelArea(areaId, okr.objetivos, okr.krs, anio).map(k => ({
    id: k.id, trimestre: k.trimestre,
    etiqueta: `T${k.trimestre} · ${okr.objetivos.find(o => o.id === k.objetivo_id)?.titulo ?? ''} › ${k.titulo}`,
  }));
}
