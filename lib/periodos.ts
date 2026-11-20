// Períodos de gestión (mes calendario) y resultados de KPI por período. Funciones puras: navegador y servidor.
//
// Reglas:
//  * El período es el mes ('AAAA-MM'). El "en curso" es el mes actual.
//  * Los KPI mensuales se evalúan cada mes. Los trimestrales, semestrales y anuales registran su AVANCE cada mes
//    y se evalúan en el último mes de su ventana (año calendario).
//  * Se puede calificar un mes mientras no esté cerrado y hasta su último día + diasLimite (los líderes);
//    el Admin puede calificar cualquier mes abierto.
//  * Los meses se cierran en orden y solo cuando ya terminaron.
import type { Empleado, Indicador } from './tipos'

export type Frecuencia = 'mensual' | 'trimestral' | 'semestral' | 'anual';
export const FRECUENCIAS: Record<Frecuencia, string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface ResultadoKpi { indicador_id: number; periodo: string; resultado: number; progreso: number; updated_at?: string }

// ------------------------------------------------------------------
// Meses
// ------------------------------------------------------------------

export const claveMes = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const partes = (clave: string) => { const [a, m] = clave.split('-').map(Number); return { anio: a, mes: m }; };
export const esClaveMes = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** "2026-11" → "Noviembre 2026" (misma etiqueta que historico_cumplimiento.periodo) */
export function etiquetaMes(clave: string): string {
  const { anio, mes } = partes(clave);
  return `${MESES[mes - 1]} ${anio}`;
}
export const etiquetaMesCorta = (clave: string) => etiquetaMes(clave).replace(/^(\w{3})\w*/, '$1');

export function sumarMeses(clave: string, n: number): string {
  const { anio, mes } = partes(clave);
  const total = anio * 12 + (mes - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Último instante para calificar el mes: fin de mes + diasLimite (23:59:59 hora local). */
export function fechaLimite(clave: string, diasLimite: number): Date {
  const { anio, mes } = partes(clave);
  return new Date(anio, mes, diasLimite, 23, 59, 59); // día 0 del mes siguiente = último día del mes
}

export const diasEntre = (desde: Date, hasta: Date) => Math.ceil((hasta.getTime() - desde.getTime()) / 86_400_000);
export const formatearFecha = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });

// ------------------------------------------------------------------
// Ventanas por frecuencia
// ------------------------------------------------------------------

export interface Ventana { etiqueta: string; mesEnVentana: number; totalMeses: number; seEvalua: boolean }

/** Ventana del KPI en ese mes: "T4 2026, mes 2 de 3"; seEvalua = el mes cierra la ventana. */
export function ventanaKpi(frecuencia: Frecuencia | undefined, clave: string): Ventana {
  const { anio, mes } = partes(clave);
  const largo = frecuencia === 'trimestral' ? 3 : frecuencia === 'semestral' ? 6 : frecuencia === 'anual' ? 12 : 1;
  const indice = Math.floor((mes - 1) / largo);
  const mesEnVentana = ((mes - 1) % largo) + 1;
  const etiqueta = largo === 1 ? etiquetaMes(clave) : largo === 12 ? `${anio}` : `${largo === 3 ? 'T' : 'S'}${indice + 1} ${anio}`;
  return { etiqueta, mesEnVentana, totalMeses: largo, seEvalua: mesEnVentana === largo };
}
export const frecuenciaDe = (i: Pick<Indicador, 'periodo'>): Frecuencia => (i.periodo as Frecuencia) || 'trimestral';

// ------------------------------------------------------------------
// Progreso (regla del dominio)
// ------------------------------------------------------------------

/** creciente: resultado / meta; decreciente (menos es mejor): 100% si resultado ≤ meta, si no meta / resultado. 0–100. */
export function calcularProgreso(direccion: Indicador['direccion'], meta: number | null | undefined, resultado: number): number {
  const m = meta && meta > 0 ? meta : 1;
  let p: number;
  if (direccion === 'decreciente') p = resultado <= 0 ? 0 : resultado <= m ? 100 : (m / resultado) * 100;
  else p = (resultado / m) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

// ------------------------------------------------------------------
// Estado de un período y del KPI en él
// ------------------------------------------------------------------

export type EstadoPeriodo = 'en_curso' | 'por_calificar' | 'vencido' | 'cerrado' | 'futuro';

export function estadoPeriodo(clave: string, cerrados: Set<string>, diasLimite: number, hoy = new Date()): EstadoPeriodo {
  if (cerrados.has(clave)) return 'cerrado';
  const actual = claveMes(hoy);
  if (clave > actual) return 'futuro';
  if (clave === actual) return 'en_curso';
  return hoy <= fechaLimite(clave, diasLimite) ? 'por_calificar' : 'vencido';
}

/** ¿Se puede calificar ese mes? Admin: cualquier mes abierto y no futuro. Líder: además dentro de la fecha límite. */
export function puedeCalificar(clave: string, cerrados: Set<string>, diasLimite: number, esAdmin: boolean, hoy = new Date()): { ok: boolean; motivo?: string } {
  const e = estadoPeriodo(clave, cerrados, diasLimite, hoy);
  if (e === 'cerrado') return { ok: false, motivo: `${etiquetaMes(clave)} está cerrado.` };
  if (e === 'futuro') return { ok: false, motivo: `${etiquetaMes(clave)} aún no empieza.` };
  if (e === 'vencido' && !esAdmin) return { ok: false, motivo: `La fecha límite para calificar ${etiquetaMes(clave)} venció (${formatearFecha(fechaLimite(clave, diasLimite))}). Solo el Admin puede registrarlo.` };
  return { ok: true };
}

/** Meses abiertos que se pueden mostrar/calificar: desde el siguiente al último cerrado (máx. 6 atrás) hasta el actual. */
export function mesesAbiertos(cerrados: Set<string>, hoy = new Date()): string[] {
  const actual = claveMes(hoy);
  const ultimoCerrado = [...cerrados].filter(c => c <= actual).sort().pop();
  let desde = ultimoCerrado ? sumarMeses(ultimoCerrado, 1) : sumarMeses(actual, -1);
  if (desde < sumarMeses(actual, -6)) desde = sumarMeses(actual, -6);
  const lista: string[] = [];
  for (let c = desde; c <= actual; c = sumarMeses(c, 1)) if (!cerrados.has(c)) lista.push(c);
  return lista;
}

/** Siguiente mes que el Admin debe cerrar (el más antiguo abierto que ya terminó), o null. */
export function siguienteACerrar(cerrados: Set<string>, hoy = new Date()): string | null {
  const actual = claveMes(hoy);
  return mesesAbiertos(cerrados, hoy).find(c => c < actual) ?? null;
}

// ------------------------------------------------------------------
// KPIs de una persona en un período
// ------------------------------------------------------------------

type IndicadorConResultados = Indicador & { resultados?: ResultadoKpi[]; created_at?: string };

export interface KpiEnPeriodo {
  kpi: IndicadorConResultados;
  ventana: Ventana;
  resultado: ResultadoKpi | null;
  /** Último resultado registrado antes de este período (referencia del avance) */
  anterior: ResultadoKpi | null;
}

/** KPIs vigentes en el período (creados antes de que termine) con su resultado de ese mes. */
export function kpisEnPeriodo(emp: Pick<Empleado, 'indicadores'>, clave: string): KpiEnPeriodo[] {
  const { anio, mes } = partes(clave);
  const finMes = new Date(anio, mes, 1).getTime();
  return ((emp.indicadores || []) as IndicadorConResultados[])
    .filter(k => !k.created_at || new Date(k.created_at).getTime() < finMes)
    .map(k => {
      const res = (k.resultados || []).slice().sort((a, b) => a.periodo.localeCompare(b.periodo));
      return {
        kpi: k,
        ventana: ventanaKpi(frecuenciaDe(k), clave),
        resultado: res.find(r => r.periodo === clave) ?? null,
        anterior: res.filter(r => r.periodo < clave).pop() ?? null,
      };
    });
}

export interface ResumenPeriodo {
  /** Promedio del progreso de los KPIs con resultado en el mes (null si ninguno tiene) */
  cumplimiento: number | null;
  calificados: number;
  pendientes: KpiEnPeriodo[];
  /** KPIs que cierran su ventana este mes (se evalúan) */
  seEvaluan: KpiEnPeriodo[];
  /** KPIs que solo registran avance este mes */
  enAvance: KpiEnPeriodo[];
}

export function resumenPeriodo(emp: Pick<Empleado, 'indicadores'>, clave: string): ResumenPeriodo {
  const kpis = kpisEnPeriodo(emp, clave);
  const con = kpis.filter(k => k.resultado);
  const pesos = pesosEfectivos((emp.indicadores || []) as Pick<Indicador, 'id' | 'peso'>[]);
  return {
    // Promedio ponderado por el peso de cada KPI, solo entre los calificados en el mes
    cumplimiento: promedioPonderado(con.map(k => ({ progreso: Number(k.resultado!.progreso), peso: pesos.get(k.kpi.id) ?? 0 }))),
    calificados: con.length,
    pendientes: kpis.filter(k => !k.resultado),
    seEvaluan: kpis.filter(k => k.ventana.seEvalua),
    enAvance: kpis.filter(k => !k.ventana.seEvalua),
  };
}

/** Frecuencias cuya ventana se evalúa este mes (para avisar: "este mes se evalúan los trimestrales"). */
export function ventanasQueCierran(clave: string): Frecuencia[] {
  return (['trimestral', 'semestral', 'anual'] as Frecuencia[]).filter(f => ventanaKpi(f, clave).seEvalua);
}

// ------------------------------------------------------------------
// Pesos de los KPIs en el cumplimiento de la persona
// ------------------------------------------------------------------

/**
 * Peso efectivo (0–100) de cada KPI. Sin pesos definidos, todos pesan igual. Si solo algunos tienen peso,
 * el resto se reparte en partes iguales lo que falta para 100.
 */
export function pesosEfectivos(kpis: Pick<Indicador, 'id' | 'peso'>[]): Map<number, number> {
  const definidos = kpis.filter(k => k.peso != null && Number(k.peso) > 0);
  const m = new Map<number, number>();
  if (definidos.length === 0) { kpis.forEach(k => m.set(k.id, kpis.length ? 100 / kpis.length : 0)); return m; }
  const suma = definidos.reduce((s, k) => s + Number(k.peso), 0);
  const sinPeso = kpis.filter(k => !(k.peso != null && Number(k.peso) > 0));
  const resto = sinPeso.length ? Math.max(0, 100 - suma) / sinPeso.length : 0;
  kpis.forEach(k => m.set(k.id, k.peso != null && Number(k.peso) > 0 ? Number(k.peso) : resto));
  return m;
}

/** Promedio ponderado de progresos (0–100). null si no hay elementos o todos pesan 0. */
export function promedioPonderado(items: { progreso: number; peso: number }[]): number | null {
  const total = items.reduce((s, i) => s + i.peso, 0);
  if (items.length === 0) return null;
  if (total <= 0) return Math.round(items.reduce((s, i) => s + i.progreso, 0) / items.length);
  return Math.round(items.reduce((s, i) => s + i.progreso * i.peso, 0) / total);
}

/** Pesos que define un líder para todos los KPIs de una persona: todos vacíos (iguales) o todos > 0 sumando 100. */
export function validarPesos(pesos: (number | null)[]): string | null {
  if (pesos.every(p => p === null)) return null;
  if (pesos.some(p => p === null || !Number.isFinite(p) || p <= 0 || p > 100)) return 'Cada KPI necesita un peso entre 1 y 100 (o deja todos vacíos para que pesen igual).';
  const suma = pesos.reduce((s: number, p) => s + (p as number), 0);
  if (Math.abs(suma - 100) > 0.5) return `Los pesos deben sumar 100% (suman ${Math.round(suma * 10) / 10}%).`;
  return null;
}
