// Historial laboral del colaborador (tabla historial_empleado, migración 20261118). Funciones puras: servidor y navegador.
import { JORNADAS, MODALIDADES, PERIODICIDADES, TIPOS_CONTRATO, type Jornada, type Modalidad, type Periodicidad, type TipoContrato } from './tipos'

export type TipoEvento =
  | 'ingreso' | 'puesto' | 'area' | 'jefe' | 'perfil' | 'contrato' | 'modalidad'
  | 'sede' | 'jornada' | 'salario' | 'desvinculacion' | 'reactivacion';

export interface EventoHistorial {
  id: number;
  empleado_id: number;
  tipo: TipoEvento;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  detalle: string | null;
  fecha: string;       // YYYY-MM-DD (fecha efectiva)
  created_at: string;
}

export const EVENTO: Record<TipoEvento, { icono: string; titulo: string }> = {
  ingreso: { icono: '🎉', titulo: 'Ingreso a la organización' },
  puesto: { icono: '💼', titulo: 'Cambio de cargo' },
  area: { icono: '🗂️', titulo: 'Cambio de área' },
  jefe: { icono: '👤', titulo: 'Cambio de jefe directo' },
  perfil: { icono: '🔑', titulo: 'Cambio de tipo de perfil' },
  contrato: { icono: '📄', titulo: 'Cambio de contrato' },
  modalidad: { icono: '🏠', titulo: 'Cambio de modalidad' },
  sede: { icono: '📍', titulo: 'Cambio de sede' },
  jornada: { icono: '⏱️', titulo: 'Cambio de jornada' },
  salario: { icono: '💰', titulo: 'Ajuste salarial' },
  desvinculacion: { icono: '🚪', titulo: 'Desvinculación' },
  reactivacion: { icono: '↩️', titulo: 'Reactivación' },
};

/** Texto legible de un valor guardado en el historial (traduce códigos de contrato, modalidad, jornada y salario). */
function legible(tipo: TipoEvento, valor: string | null, formatearMonto?: (v: number, moneda: string) => string): string | null {
  if (!valor) return null;
  if (tipo === 'contrato') return TIPOS_CONTRATO[valor as TipoContrato] || valor;
  if (tipo === 'modalidad') return MODALIDADES[valor as Modalidad] || valor;
  if (tipo === 'jornada') return JORNADAS[valor as Jornada] || valor;
  if (tipo === 'salario') {
    const [monto, moneda, periodicidad] = valor.split(' ');
    const n = Number(monto);
    const texto = formatearMonto && Number.isFinite(n) ? formatearMonto(n, moneda) : `${moneda} ${monto}`;
    return `${texto}${periodicidad ? ` ${(PERIODICIDADES[periodicidad as Periodicidad] || periodicidad).toLowerCase()}` : ''}`;
  }
  return valor;
}

export function describirEvento(ev: EventoHistorial, formatearMonto?: (v: number, moneda: string) => string): string {
  const ant = legible(ev.tipo, ev.valor_anterior, formatearMonto);
  const nvo = legible(ev.tipo, ev.valor_nuevo, formatearMonto);
  switch (ev.tipo) {
    case 'ingreso': return [nvo && `Como ${nvo}`, ev.detalle && `en ${ev.detalle}`].filter(Boolean).join(' ') || 'Inicio de la relación laboral';
    case 'desvinculacion': return [ant && `Último cargo: ${ant}`, ev.detalle && `Motivo: ${ev.detalle}`].filter(Boolean).join(' · ');
    case 'reactivacion': return nvo ? `Regresa como ${nvo}` : 'Vuelve a la organización';
    case 'salario': {
      const base = ant ? `${ant} → ${nvo}` : `Salario inicial: ${nvo}`;
      return ev.detalle ? `${base} · ${ev.detalle}` : base;
    }
    default:
      if (!ant && nvo) return `Asignado: ${nvo}`;
      if (ant && !nvo) return `Se quitó: ${ant}`;
      return `${ant} → ${nvo}`;
  }
}

// ------------------------------------------------------------------
// Señales para el riesgo de fuga
// ------------------------------------------------------------------

export interface SenalesHistorial {
  /** Meses desde el último cambio de puesto (o desde el ingreso) */
  mesesEnPuesto: number | null;
  /** Meses desde el último CAMBIO de jefe (no cuenta la primera asignación) */
  mesesDesdeCambioJefe: number | null;
  /** Cambios de área en los últimos 12 meses (no cuenta la primera asignación) */
  cambiosArea12m: number;
}

export const mesesEntre = (desdeISO: string, hoy = new Date()) => {
  const d = new Date(desdeISO.slice(0, 10) + 'T00:00:00');
  return Math.max((hoy.getFullYear() - d.getFullYear()) * 12 + (hoy.getMonth() - d.getMonth()) - (hoy.getDate() < d.getDate() ? 1 : 0), 0);
};

/** Calcula las señales de un colaborador a partir de SUS eventos (cualquier orden). */
export function calcularSenalesHistorial(eventos: Pick<EventoHistorial, 'tipo' | 'valor_anterior' | 'fecha'>[], fechaIngreso?: string | null, hoy = new Date()): SenalesHistorial {
  const ordenados = [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha)); // más reciente primero
  const ultimoPuesto = ordenados.find(e => e.tipo === 'puesto')?.fecha
    ?? ordenados.find(e => e.tipo === 'ingreso')?.fecha
    ?? fechaIngreso ?? null;
  const ultimoCambioJefe = ordenados.find(e => e.tipo === 'jefe' && e.valor_anterior)?.fecha ?? null;
  const cambiosArea12m = ordenados.filter(e => e.tipo === 'area' && e.valor_anterior && mesesEntre(e.fecha, hoy) < 12).length;
  return {
    mesesEnPuesto: ultimoPuesto ? mesesEntre(ultimoPuesto, hoy) : null,
    mesesDesdeCambioJefe: ultimoCambioJefe ? mesesEntre(ultimoCambioJefe, hoy) : null,
    cambiosArea12m,
  };
}
