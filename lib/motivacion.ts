// Mensajes de progreso y logros: convierten las cifras de desempeño en mensajes que impulsan el desarrollo.
// Funciones puras (sin datos nuevos: todo sale de los KPIs y planes de mejora que ya existen).
import type { Empleado } from './tipos'
import type { UmbralesDesempeno } from './bi'

export type TipoLogro = 'meta' | 'plan';
export interface Logro { tipo: TipoLogro; titulo: string; detalle: string }

/** Logros visibles: cada KPI al 100% (meta cumplida) y cada compromiso del plan de mejora completado. */
export function logrosDe(emp: Pick<Empleado, 'indicadores' | 'planes_mejora'>): Logro[] {
  const metas: Logro[] = (emp.indicadores || [])
    .filter(i => (i.progreso || 0) >= 100)
    .map(i => ({ tipo: 'meta', titulo: 'Meta cumplida', detalle: i.titulo }));
  const planes: Logro[] = (emp.planes_mejora || [])
    .filter(p => p.estado === 'completado')
    .map(p => ({ tipo: 'plan', titulo: 'Compromiso cumplido', detalle: p.compromiso }));
  return [...metas, ...planes];
}

export type TonoMensaje = 'logro' | 'avance' | 'impulso' | 'inicio';
export interface MensajeProgreso { titulo: string; texto: string; tono: TonoMensaje }

const primerNombre = (nombre: string) => (nombre || '').trim().split(/\s+/)[0] || '';
const pts = (n: number) => `${Math.abs(Math.round(n * 10) / 10)} punto${Math.abs(n) === 1 ? '' : 's'}`;

/**
 * Mensaje según el cumplimiento, la tendencia y lo que falta. Siempre en positivo: bajo el umbral se habla de
 * oportunidad y del siguiente paso concreto, nunca de fracaso.
 */
export function mensajeProgreso(emp: Pick<Empleado, 'nombre' | 'cumplimiento_general' | 'indicadores' | 'planes_mejora'>,
  u: UmbralesDesempeno, variacion: number | null): MensajeProgreso {
  const n = primerNombre(emp.nombre);
  const c = Math.round(emp.cumplimiento_general || 0);
  const kpis = emp.indicadores || [];
  const pendientes = (emp.planes_mejora || []).filter(p => p.estado !== 'completado').length;
  const tendencia = variacion === null ? '' : variacion > 0 ? ` Subiste ${pts(variacion)} frente al período anterior.` : '';

  if (kpis.length === 0) {
    return { tono: 'inicio', titulo: `¡Hola, ${n}! 👋`, texto: 'Aún no tienes metas asignadas. Conversa con tu líder para definirlas: son el punto de partida de tu crecimiento.' };
  }
  if (c >= u.umbral_desempeno_alto) {
    return { tono: 'logro', titulo: `¡Excelente trabajo, ${n}! 🎉`, texto: `Estás en desempeño alto con ${c}%.${tendencia} Sigue así y comparte lo que te funciona con tu equipo.` };
  }
  const cercana = [...kpis].filter(i => (i.progreso || 0) < 100).sort((a, b) => (b.progreso || 0) - (a.progreso || 0))[0];
  if (c >= u.umbral_desempeno_bajo) {
    const falta = u.umbral_desempeno_alto - c;
    return {
      tono: 'avance', titulo: `Vas por buen camino, ${n} 🚀`,
      texto: `Te ${falta === 1 ? 'falta 1 punto' : `faltan ${falta} puntos`} para el nivel alto.${tendencia}${cercana ? ` Tu meta más cercana: "${cercana.titulo}" (${Math.round(cercana.progreso || 0)}%).` : ''}`,
    };
  }
  const recuperar = variacion !== null && variacion < 0 ? ` Bajaste ${pts(variacion)} este período: es una buena oportunidad para retomar el ritmo.` : tendencia;
  return {
    tono: 'impulso', titulo: `Cada paso cuenta, ${n} 🌱`,
    texto: `Tienes una oportunidad de crecimiento con ${c}%.${recuperar}${pendientes > 0 ? ` Enfócate en tus ${pendientes} compromiso(s) del plan de mejora.` : cercana ? ` Empieza por "${cercana.titulo}".` : ''}`,
  };
}

/** Etiqueta del potencial en lenguaje de desarrollo (para la propia persona). */
export const etiquetaPotencial = (score?: number | null) =>
  score === 3 ? '⭐ Alto potencial' : score === 2 ? '🚀 En crecimiento' : score === 1 ? '🌱 En desarrollo' : 'Sin evaluar';
