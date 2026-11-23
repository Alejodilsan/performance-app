// Plan de desarrollo individual (PDI 70-20-10) y check-ins mensuales. Funciones puras (servidor y navegador).
import { claveMes, sumarMeses } from './periodos'

export type TipoAccion = 'experiencia' | 'relacion' | 'formacion';
export type EstadoObjetivo = 'en_curso' | 'logrado' | 'no_logrado' | 'cancelado';

export const TIPOS_ACCION: Record<TipoAccion, { titulo: string; meta: number; icono: string; ayuda: string; ejemplo: string }> = {
  experiencia: { titulo: 'Experiencia', meta: 70, icono: '🛠️', ayuda: 'Aprender haciendo: retos, proyectos, responsabilidades nuevas.', ejemplo: 'Liderar la reunión semanal del equipo durante un mes.' },
  relacion: { titulo: 'Relaciones', meta: 20, icono: '🤝', ayuda: 'Aprender de otros: mentoría, acompañamiento, feedback.', ejemplo: 'Sesión quincenal con un mentor de otra área.' },
  formacion: { titulo: 'Formación', meta: 10, icono: '📚', ayuda: 'Aprendizaje formal: cursos, talleres, lecturas.', ejemplo: 'Curso de comunicación efectiva (8 h).' },
};

export const ESTADOS_OBJETIVO: Record<EstadoObjetivo, { titulo: string; color: string }> = {
  en_curso: { titulo: 'En curso', color: 'bg-marca-50 text-marca-700 border-marca-100' },
  logrado: { titulo: 'Logrado', color: 'bg-acento-50 text-acento-800 border-acento-200' },
  no_logrado: { titulo: 'No logrado', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  cancelado: { titulo: 'Cancelado', color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export interface AccionPDI { id: number; objetivo_id: number; tipo: TipoAccion; descripcion: string; fecha_limite: string | null; completada: boolean; completada_en: string | null; orden: number }
export interface ObjetivoPDI {
  id: number; empleado_id: number; ciclo_id: number | null; competencia_id: number | null; competencia: string | null;
  titulo: string; resultado_esperado: string | null; fecha_limite: string | null; estado: EstadoObjetivo;
  created_at: string; acciones: AccionPDI[];
}
export interface CheckinPDI { id: number; empleado_id: number; periodo: string; comentario: string; proximos_pasos: string | null; registrado_por: number | null; autor?: string; created_at: string }

export const MAX_OBJETIVOS_ACTIVOS = 3;

/** Avance del objetivo: 100 si se logró; si no, % de acciones completadas (0 sin acciones). */
export function avanceObjetivo(o: Pick<ObjetivoPDI, 'estado' | 'acciones'>): number {
  if (o.estado === 'logrado') return 100;
  if (o.acciones.length === 0) return 0;
  return Math.round((o.acciones.filter(a => a.completada).length / o.acciones.length) * 100);
}

/** Reparto de las acciones por tipo (en %), para comparar con el 70-20-10 sugerido */
export function mezcla(acciones: Pick<AccionPDI, 'tipo'>[]): Record<TipoAccion, number> {
  const total = acciones.length;
  const pct = (t: TipoAccion) => (total ? Math.round((acciones.filter(a => a.tipo === t).length / total) * 100) : 0);
  return { experiencia: pct('experiencia'), relacion: pct('relacion'), formacion: pct('formacion') };
}

/** Consejo si el plan depende demasiado de la formación o no tiene práctica */
export function consejoMezcla(acciones: Pick<AccionPDI, 'tipo'>[]): string | null {
  if (acciones.length < 2) return null;
  const m = mezcla(acciones);
  if (m.experiencia === 0) return 'Agrega al menos una acción de experiencia: la mayor parte del desarrollo ocurre aprendiendo en el trabajo.';
  if (m.formacion > 50) return 'El plan se apoya mucho en cursos. Combínalos con retos prácticos y acompañamiento para que el aprendizaje se aplique.';
  return null;
}

export const esActivo = (o: Pick<ObjetivoPDI, 'estado'>) => o.estado === 'en_curso';

export function validarObjetivo(o: { titulo?: string; resultado_esperado?: string | null; fecha_limite?: string | null }): string | null {
  if (!o.titulo?.trim() || o.titulo.trim().length < 5) return 'Describe el objetivo de desarrollo (qué quieres lograr).';
  if (!o.resultado_esperado?.trim()) return 'Indica cómo se verá el cambio: el resultado esperado u observable.';
  if (o.fecha_limite && !/^\d{4}-\d{2}-\d{2}$/.test(o.fecha_limite)) return 'Fecha límite no válida.';
  return null;
}

/** Estado del seguimiento mensual de una persona con PDI activo */
export function estadoCheckin(ultimoPeriodo: string | null, hoy = new Date()): 'al_dia' | 'pendiente' | 'atrasado' {
  const mes = claveMes(hoy);
  if (ultimoPeriodo === mes) return 'al_dia';
  if (ultimoPeriodo === sumarMeses(mes, -1)) return 'pendiente';
  return 'atrasado';
}

/** Correlación de Pearson (null con menos de 5 pares o sin variación) */
export function pearson(pares: [number, number][]): number | null {
  if (pares.length < 5) return null;
  const n = pares.length;
  const mx = pares.reduce((s, p) => s + p[0], 0) / n;
  const my = pares.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, dx = 0, dy = 0;
  pares.forEach(([x, y]) => { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; });
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

export function interpretarCorrelacion(r: number | null): string {
  if (r === null) return 'Sin datos suficientes (se necesitan al menos 5 personas con ambos resultados).';
  const a = Math.abs(r);
  const fuerza = a >= 0.7 ? 'fuerte' : a >= 0.4 ? 'moderada' : a >= 0.2 ? 'débil' : 'casi nula';
  if (fuerza === 'casi nula') return 'Las competencias (360) y el cumplimiento de KPIs no se mueven juntos: miden cosas distintas o hay que revisar metas y calibración.';
  return `Relación ${fuerza} ${r > 0 ? 'positiva' : 'negativa'}: ${r > 0 ? 'quienes tienen mejores competencias tienden a cumplir más sus KPIs.' : 'revisa la calibración: los mejores evaluados cumplen menos sus KPIs.'}`;
}
