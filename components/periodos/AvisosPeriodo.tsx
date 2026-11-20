'use client'
// Período en curso (encabezado) y avisos de calificaciones pendientes con su fecha límite.
import type { Empleado } from '@/lib/tipos'
import {
  FRECUENCIAS, claveMes, diasEntre, estadoPeriodo, etiquetaMes, fechaLimite, formatearFecha, frecuenciaDe,
  mesesAbiertos, resumenPeriodo, siguienteACerrar, ventanaKpi, ventanasQueCierran,
} from '@/lib/periodos'

interface PropsChip { cerrados: string[]; diasLimite: number; esAdmin: boolean; onCerrar?: () => void }

/** "📅 Noviembre 2026 · en curso" y, para el Admin, el siguiente mes por cerrar. */
export function ChipPeriodo({ cerrados, diasLimite, esAdmin, onCerrar }: PropsChip) {
  const actual = claveMes();
  const set = new Set(cerrados);
  const porCerrar = siguienteACerrar(set);
  const estado = porCerrar ? estadoPeriodo(porCerrar, set, diasLimite) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold bg-acento-50 text-acento-800 border border-acento-200 px-3 py-1 rounded-full whitespace-nowrap" title="Período de gestión en curso">
        📅 {etiquetaMes(actual)} · en curso
      </span>
      {esAdmin && porCerrar && onCerrar && (
        <button type="button" onClick={onCerrar}
          title={estado === 'vencido' ? 'La fecha límite para calificar ya pasó' : `Los líderes califican hasta el ${formatearFecha(fechaLimite(porCerrar, diasLimite))}`}
          className={`text-[11px] font-bold px-3 py-1 rounded-full border whitespace-nowrap transition ${estado === 'vencido' ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' : 'bg-white text-marca-700 border-marca-200 hover:bg-marca-50'}`}>
          🔒 Cerrar {etiquetaMes(porCerrar)}
        </button>
      )}
      {esAdmin && !porCerrar && onCerrar && (
        <button type="button" onClick={onCerrar} className="text-[11px] font-bold px-3 py-1 rounded-full border bg-white text-marca-600 border-marca-200 hover:bg-marca-50 whitespace-nowrap">🔒 Cierres</button>
      )}
    </div>
  );
}

interface PropsAvisos {
  /** Personas cuyas calificaciones dependen de quien mira (reportes directos; Admin: todos) */
  personas: Empleado[];
  cerrados: string[];
  diasLimite: number;
  esAdmin: boolean;
  disponible: boolean;
}

interface Aviso { tono: 'urgente' | 'info' | 'vencido'; texto: string }

/** Avisos de calificaciones pendientes por mes abierto, con su fecha límite. */
export function AvisosPeriodo({ personas, cerrados, diasLimite, esAdmin, disponible }: PropsAvisos) {
  if (!disponible) {
    return esAdmin ? (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-3">
        Falta aplicar la migración <strong>20261121_periodos.sql</strong> en Supabase para calificar KPIs por período.
      </p>
    ) : null;
  }
  const set = new Set(cerrados);
  const hoy = new Date();
  const actual = claveMes(hoy);
  const avisos: Aviso[] = [];
  const conKpis = personas.filter(p => (p.indicadores || []).length > 0);
  const quien = esAdmin ? 'de la organización' : 'de tu equipo';

  mesesAbiertos(set, hoy).forEach(mes => {
    const pend = conKpis.map(p => ({ p, n: resumenPeriodo(p, mes).pendientes.length })).filter(x => x.n > 0);
    const total = pend.reduce((s, x) => s + x.n, 0);
    const estado = estadoPeriodo(mes, set, diasLimite, hoy);
    const limite = fechaLimite(mes, diasLimite);
    const dias = diasEntre(hoy, limite);
    if (mes < actual) {
      if (total === 0) {
        if (esAdmin) avisos.push({ tono: 'info', texto: `✓ ${etiquetaMes(mes)} está completo: ya lo puedes cerrar.` });
      } else if (estado === 'vencido') {
        avisos.push({ tono: 'vencido', texto: esAdmin
          ? `${etiquetaMes(mes)}: la fecha límite (${formatearFecha(limite)}) venció con ${total} KPI(s) sin calificar de ${pend.length} persona(s). Puedes registrarlos tú o cerrar el mes igual.`
          : `${etiquetaMes(mes)}: la fecha límite (${formatearFecha(limite)}) venció con ${total} KPI(s) sin calificar ${quien}. Ahora solo el Admin puede registrarlos.` });
      } else {
        avisos.push({ tono: 'urgente', texto: `⏰ ${etiquetaMes(mes)}: faltan ${total} calificación(es) ${quien} (${pend.length} persona(s)). Fecha límite: ${formatearFecha(limite)} · ${dias <= 0 ? 'hoy' : `en ${dias} día(s)`}.` });
      }
    } else {
      // Mes en curso: avisar qué ventanas se evalúan y los pendientes en la recta final
      const cierran = ventanasQueCierran(mes).filter(f => conKpis.some(p => (p.indicadores || []).some(k => frecuenciaDe(k) === f)));
      if (cierran.length > 0) {
        avisos.push({ tono: 'info', texto: `📌 En ${etiquetaMes(mes)} se evalúan los KPIs ${cierran.map(f => `${FRECUENCIAS[f].toLowerCase()}es (${ventanaKpi(f, mes).etiqueta})`).join(' y ')}. Califícalos antes del ${formatearFecha(limite)}.` });
      }
      const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      const quedan = diasEntre(hoy, finDeMes);
      if (total > 0 && quedan <= 5) {
        avisos.push({ tono: 'info', texto: `Quedan ${quedan} día(s) de ${etiquetaMes(mes)}: faltan ${total} calificación(es) ${quien}. Hay plazo hasta el ${formatearFecha(limite)}.` });
      }
    }
  });

  if (avisos.length === 0) return null;
  const estilo = { urgente: 'bg-amber-50 border-amber-200 text-amber-900', vencido: 'bg-marca-50 border-marca-200 text-marca-800', info: 'bg-acento-50 border-acento-200 text-acento-900' };
  return (
    <div className="space-y-2" role="status">
      {avisos.map((a, i) => <p key={i} className={`text-xs font-medium border rounded-2xl px-4 py-3 ${estilo[a.tono]}`}>{a.texto}</p>)}
    </div>
  );
}
