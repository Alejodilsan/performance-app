// Lógica del módulo BI. Funciones puras: las usan el servidor (/api/bi) y el navegador.
import type { Area, Empleado, Periodicidad } from './tipos'
import { idsDescendientes } from './jerarquia'
import type { SenalesHistorial } from './historial'

// ------------------------------------------------------------------
// Configuración (por empresa, ver migración 20261117)
// ------------------------------------------------------------------

export interface ConfiguracionBI {
  moneda_principal: string;
  factor_prestacional: number;
  horas_mes: number;
  umbral_desempeno_bajo: number;
  umbral_desempeno_alto: number;
}

/** Valores por defecto: Colombia (COP, factor prestacional 1,52, 182 h/mes = 42 h/semana). */
export const CONFIG_BI_DEFECTO: ConfiguracionBI = {
  moneda_principal: 'COP',
  factor_prestacional: 1.52,
  horas_mes: 182,
  umbral_desempeno_bajo: 60,
  umbral_desempeno_alto: 85,
};

export function validarConfiguracion(c: ConfiguracionBI): string | null {
  if (!c.moneda_principal) return 'Selecciona la moneda principal.';
  if (!(c.factor_prestacional >= 1 && c.factor_prestacional <= 3)) return 'El factor prestacional debe estar entre 1 y 3.';
  if (!(c.horas_mes > 0 && c.horas_mes <= 400)) return 'Las horas al mes deben estar entre 1 y 400.';
  if (!(c.umbral_desempeno_bajo >= 1 && c.umbral_desempeno_alto <= 100)) return 'Los umbrales deben estar entre 1 y 100.';
  if (c.umbral_desempeno_bajo >= c.umbral_desempeno_alto) return 'El umbral bajo debe ser menor que el alto.';
  return null;
}

// ------------------------------------------------------------------
// Desempeño y Nine Box
// ------------------------------------------------------------------

export type Nivel = 1 | 2 | 3;
export type UmbralesDesempeno = Pick<ConfiguracionBI, 'umbral_desempeno_bajo' | 'umbral_desempeno_alto'>;

/** 1 = bajo, 2 = medio, 3 = alto, según los umbrales configurados. */
export function nivelDesempeno(score: number, u: UmbralesDesempeno): Nivel {
  if (score < u.umbral_desempeno_bajo) return 1;
  if (score < u.umbral_desempeno_alto) return 2;
  return 3;
}

export type CeldaId = '3-1' | '3-2' | '3-3' | '2-1' | '2-2' | '2-3' | '1-1' | '1-2' | '1-3'; // potencial-desempeño
export type Accion = 'retener' | 'desarrollar' | 'observar' | 'actuar';

export interface DefinicionCelda { id: CeldaId; titulo: string; accion: Accion; recomendacion: string }

/** Orden visual: filas de potencial alto → bajo; columnas de desempeño bajo → alto. */
export const CELDAS_NINE_BOX: DefinicionCelda[] = [
  { id: '3-1', titulo: 'Enigma', accion: 'desarrollar', recomendacion: 'Alto potencial sin resultados: revisar rol, carga y acompañamiento.' },
  { id: '3-2', titulo: 'Futura estrella', accion: 'retener', recomendacion: 'Acelerar con retos y mentoría; plan de carrera.' },
  { id: '3-3', titulo: 'Estrella', accion: 'retener', recomendacion: 'Talento crítico: plan de sucesión, reconocimiento y retención.' },
  { id: '2-1', titulo: 'Dilema', accion: 'observar', recomendacion: 'Plan de mejora con metas claras y seguimiento cercano.' },
  { id: '2-2', titulo: 'Jugador clave', accion: 'desarrollar', recomendacion: 'Base del equipo: formación para subir de nivel.' },
  { id: '2-3', titulo: 'Alto impacto', accion: 'retener', recomendacion: 'Reconocer resultados y ampliar su alcance.' },
  { id: '1-1', titulo: 'Riesgo', accion: 'actuar', recomendacion: 'Plan de mejora inmediato o reubicación.' },
  { id: '1-2', titulo: 'Efectivo', accion: 'observar', recomendacion: 'Cumple lo básico: mantener y definir expectativas.' },
  { id: '1-3', titulo: 'Especialista', accion: 'desarrollar', recomendacion: 'Experto en su rol: aprovechar como referente técnico.' },
];

export const CELDAS_TALENTO_CLAVE: CeldaId[] = ['3-3', '3-2', '2-3'];

export type ClasificacionNineBox =
  | { estado: 'ok'; celda: CeldaId; potencial: Nivel; desempeno: Nivel }
  | { estado: 'sin_kpis' }
  | { estado: 'sin_potencial' };

/**
 * Ubica a una persona en el Nine Box. No se la clasifica (en vez de asumir "bajo") si:
 *  - no tiene KPIs: su % de cumplimiento no mide nada todavía;
 *  - no tiene evaluación de potencial registrada.
 */
export function clasificarNineBox(emp: Pick<Empleado, 'id' | 'cumplimiento_general' | 'potencial_score' | 'indicadores'>,
  u: UmbralesDesempeno, potencialEvaluado: Set<number>): ClasificacionNineBox {
  if (!emp.indicadores || emp.indicadores.length === 0) return { estado: 'sin_kpis' };
  const pot = emp.potencial_score;
  if (!potencialEvaluado.has(emp.id) || !pot || pot < 1 || pot > 3) return { estado: 'sin_potencial' };
  const des = nivelDesempeno(emp.cumplimiento_general || 0, u);
  return { estado: 'ok', celda: `${pot}-${des}` as CeldaId, potencial: pot as Nivel, desempeno: des };
}

// ------------------------------------------------------------------
// Costos
// ------------------------------------------------------------------

/** Salario base mensual: anual ÷ 12; por hora × horas/mes (la mitad si la jornada es medio tiempo). */
export function mensualizar(salario: number, periodicidad: Periodicidad, jornada: Empleado['jornada'], horasMes: number): number {
  if (periodicidad === 'anual') return salario / 12;
  if (periodicidad === 'por_hora') return salario * horasMes * (jornada === 'parcial' ? 0.5 : 1);
  return salario;
}

export const costoEmpresa = (baseMensual: number, factor: number) => baseMensual * factor;

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const formatearCompacto = (valor: number, moneda: string) => {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, notation: 'compact', maximumFractionDigits: 1 }).format(valor);
  } catch {
    return `${moneda} ${Math.round(valor).toLocaleString('es-CO')}`;
  }
};

// ------------------------------------------------------------------
// Filtros del BI (los aplican igual el servidor y el navegador)
// ------------------------------------------------------------------

export interface FiltrosBI { areaId: number | null; sede: string | null; contrato: string | null }
export const FILTROS_VACIOS: FiltrosBI = { areaId: null, sede: null, contrato: null };

/** El filtro de área incluye sus sub-áreas. */
export function aplicarFiltros<T extends Pick<Empleado, 'area_id' | 'sede' | 'tipo_contrato'>>(lista: T[], f: FiltrosBI, areas: Area[]): T[] {
  const areasOk = f.areaId !== null ? new Set([f.areaId, ...idsDescendientes(f.areaId, areas)]) : null;
  return lista.filter(e =>
    (!areasOk || (e.area_id !== null && areasOk.has(e.area_id))) &&
    (!f.sede || (e.sede || '') === f.sede) &&
    (!f.contrato || (e.tipo_contrato || '') === f.contrato)
  );
}

// ------------------------------------------------------------------
// Retención de talento clave
// ------------------------------------------------------------------

export interface SenalesSalariales { bajoMedianaPct: number | null; mesesSinAjuste: number | null }
export interface SenalRiesgo { clave: string; texto: string }

const UMBRAL_BAJO_MEDIANA = 10;   // % por debajo de la mediana de sus pares
const MESES_SIN_AJUSTE = 18;
const CAIDA_TENDENCIA = 10;       // puntos de cumplimiento entre los dos últimos cortes
const MESES_ESTANCAMIENTO = 36;   // en el mismo puesto
const MESES_CAMBIO_JEFE = 6;      // un cambio de jefe reciente es un momento de riesgo
const CAMBIOS_AREA_12M = 2;

/**
 * Señales de riesgo de fuga. Las salariales solo llegan para el Admin (el resto nunca ve datos individuales de salario);
 * las del historial laboral (estancamiento, cambio de jefe, reubicaciones) las ve cualquiera con acceso al BI.
 */
export function senalesRetencion(emp: Pick<Empleado, 'historico' | 'planes_mejora'>, salariales?: SenalesSalariales, historial?: SenalesHistorial): SenalRiesgo[] {
  const senales: SenalRiesgo[] = [];
  const hist = [...(emp.historico || [])].sort((a, b) => new Date(a.fecha_corte).getTime() - new Date(b.fecha_corte).getTime());
  if (hist.length >= 2) {
    const caida = hist[hist.length - 2].cumplimiento - hist[hist.length - 1].cumplimiento;
    if (caida >= CAIDA_TENDENCIA) senales.push({ clave: 'tendencia', texto: `Cumplimiento bajó ${Math.round(caida)} pts` });
  }
  const hoy = Date.now();
  const vencidos = (emp.planes_mejora || []).filter(p => p.estado !== 'completado' && new Date(p.fecha_limite).getTime() < hoy).length;
  if (vencidos > 0) senales.push({ clave: 'planes', texto: `${vencidos} compromiso(s) vencido(s)` });
  if (salariales?.bajoMedianaPct != null && salariales.bajoMedianaPct >= UMBRAL_BAJO_MEDIANA) {
    senales.push({ clave: 'salario', texto: `${Math.round(salariales.bajoMedianaPct)}% bajo la mediana de su puesto` });
  }
  if (salariales?.mesesSinAjuste != null && salariales.mesesSinAjuste >= MESES_SIN_AJUSTE) {
    senales.push({ clave: 'ajuste', texto: `${salariales.mesesSinAjuste} meses sin ajuste salarial` });
  }
  if (historial?.mesesEnPuesto != null && historial.mesesEnPuesto >= MESES_ESTANCAMIENTO) {
    senales.push({ clave: 'estancamiento', texto: `${Math.floor(historial.mesesEnPuesto / 12)} años en el mismo puesto` });
  }
  if (historial?.mesesDesdeCambioJefe != null && historial.mesesDesdeCambioJefe < MESES_CAMBIO_JEFE) {
    senales.push({ clave: 'jefe', texto: historial.mesesDesdeCambioJefe === 0 ? 'Cambió de jefe este mes' : `Cambió de jefe hace ${historial.mesesDesdeCambioJefe} mes(es)` });
  }
  if (historial && historial.cambiosArea12m >= CAMBIOS_AREA_12M) {
    senales.push({ clave: 'reubicaciones', texto: `${historial.cambiosArea12m} cambios de área en 12 meses` });
  }
  return senales;
}

export const nivelRiesgo = (senales: SenalRiesgo[]): 'alto' | 'medio' | null =>
  senales.length >= 2 ? 'alto' : senales.length === 1 ? 'medio' : null;

// ------------------------------------------------------------------
// Estructura
// ------------------------------------------------------------------

export function antiguedadAnios(fechaIngreso?: string | null, hoy = new Date()): number | null {
  if (!fechaIngreso) return null;
  const f = new Date(fechaIngreso + 'T00:00:00');
  if (Number.isNaN(f.getTime())) return null;
  return (hoy.getTime() - f.getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function rangoAntiguedad(fechaIngreso?: string | null): string {
  const a = antiguedadAnios(fechaIngreso);
  if (a === null) return 'Sin fecha';
  if (a < 1) return '< 1 año';
  if (a < 3) return '1 a 3 años';
  if (a < 5) return '3 a 5 años';
  return '5+ años';
}
export const ORDEN_ANTIGUEDAD = ['< 1 año', '1 a 3 años', '3 a 5 años', '5+ años', 'Sin fecha'];

/** Cuenta por categoría, de mayor a menor (o en el orden indicado). */
export function contarPor<T>(lista: T[], clave: (x: T) => string, orden?: string[]): { etiqueta: string; cantidad: number }[] {
  const mapa = new Map<string, number>();
  lista.forEach(x => { const k = clave(x); mapa.set(k, (mapa.get(k) || 0) + 1); });
  const filas = [...mapa.entries()].map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }));
  return orden
    ? filas.sort((a, b) => orden.indexOf(a.etiqueta) - orden.indexOf(b.etiqueta))
    : filas.sort((a, b) => b.cantidad - a.cantidad);
}

// ------------------------------------------------------------------
// Rotación
// ------------------------------------------------------------------

export interface Rotacion {
  ultimos12: number;
  /** % sobre la plantilla promedio de los últimos 12 meses (aprox.: (actual + actual + salidas) / 2) */
  tasa12: number;
  porMes: { mes: string; etiqueta: string; cantidad: number }[];
  porMotivo: { motivo: string; cantidad: number }[];
}

export function calcularRotacion(salidas: { fecha: string | null | undefined; motivo: string | null | undefined }[], headcountActual: number, hoy = new Date()): Rotacion {
  const meses: { mes: string; etiqueta: string; cantidad: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      cantidad: 0,
    });
  }
  const desde = meses[0].mes;
  const motivos = new Map<string, number>();
  let total = 0;
  salidas.forEach(s => {
    if (!s.fecha) return;
    const mes = s.fecha.slice(0, 7);
    const fila = meses.find(m => m.mes === mes);
    if (!fila || mes < desde) return;
    fila.cantidad++;
    total++;
    const motivo = (s.motivo || 'Sin motivo').split(':')[0].trim(); // "Despido: detalle" → "Despido"
    motivos.set(motivo, (motivos.get(motivo) || 0) + 1);
  });
  const promedio = (headcountActual + headcountActual + total) / 2;
  return {
    ultimos12: total,
    tasa12: promedio > 0 ? Math.round((total / promedio) * 1000) / 10 : 0,
    porMes: meses,
    porMotivo: [...motivos.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
  };
}
