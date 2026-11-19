'use client'
import { useEffect, useState } from 'react'
import { EVENTO, calcularSenalesHistorial, describirEvento, mesesEntre, type EventoHistorial } from '@/lib/historial'
import { cargarHistorial } from '@/lib/historialApi'
import { formatearMonto } from '@/lib/colaboradores'
import { mensajeDeError } from '@/lib/errores'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'migracion' }
  | { tipo: 'ok'; eventos: EventoHistorial[]; incluyeSalarios: boolean };

/** Línea de tiempo del historial laboral de un colaborador (más reciente primero). */
export function HistorialEmpleado({ empleadoId, fechaIngreso }: { empleadoId: number; fechaIngreso?: string | null }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    let vigente = true;
    cargarHistorial(empleadoId)
      .then(r => { if (vigente) setEstado(r.estado === 'ok' ? { tipo: 'ok', eventos: r.eventos, incluyeSalarios: r.incluyeSalarios } : { tipo: 'migracion' }); })
      .catch(e => { if (vigente) setEstado({ tipo: 'error', mensaje: mensajeDeError(e) }); });
    return () => { vigente = false; };
  }, [empleadoId]);

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-marca-900">🕓 Historial laboral</h3>
          <p className="text-[11px] text-slate-500">Cambios de cargo, área, jefe, condiciones y salario, registrados automáticamente.</p>
        </div>
        {estado.tipo === 'ok' && <ResumenTrayectoria eventos={estado.eventos} fechaIngreso={fechaIngreso} />}
      </div>

      {estado.tipo === 'cargando' && <p className="text-xs text-slate-400 italic py-4">Cargando historial…</p>}
      {estado.tipo === 'error' && <p className="text-xs text-red-600 py-4">{estado.mensaje}</p>}
      {estado.tipo === 'migracion' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          El historial se activa al aplicar la migración <code>20261118_historial_empleado.sql</code> en Supabase.
        </p>
      )}
      {estado.tipo === 'ok' && (
        estado.eventos.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Aún no hay movimientos registrados. Los próximos cambios en su ficha aparecerán aquí.
          </p>
        ) : (
          <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
            {estado.eventos.map(ev => (
              <li key={ev.id} className="ml-5">
                <span className="absolute -left-[13px] w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-[11px]" aria-hidden>
                  {EVENTO[ev.tipo].icono}
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-xs font-bold text-marca-900">{EVENTO[ev.tipo].titulo}</p>
                  <time className="text-[10px] font-semibold text-slate-400" dateTime={ev.fecha}>{formatearFecha(ev.fecha)}</time>
                </div>
                <p className="text-[11px] text-slate-600">{describirEvento(ev, formatearMonto)}</p>
              </li>
            ))}
          </ol>
        )
      )}
      {estado.tipo === 'ok' && !estado.incluyeSalarios && (
        <p className="text-[10px] text-slate-400 mt-4">🔒 Los ajustes salariales solo los ve el Admin.</p>
      )}
    </div>
  );
}

/** Chips de resumen: antigüedad, tiempo en el puesto y número de movimientos. */
function ResumenTrayectoria({ eventos, fechaIngreso }: { eventos: EventoHistorial[]; fechaIngreso?: string | null }) {
  const s = calcularSenalesHistorial(eventos, fechaIngreso);
  const ingreso = eventos.find(e => e.tipo === 'ingreso')?.fecha ?? fechaIngreso ?? null;
  const movimientos = eventos.filter(e => ['puesto', 'area', 'jefe'].includes(e.tipo) && e.valor_anterior).length;
  const chips = [
    ingreso && `Antigüedad: ${duracion(mesesEntre(ingreso))}`,
    s.mesesEnPuesto !== null && `En el cargo: ${duracion(s.mesesEnPuesto)}`,
    `${movimientos} movimiento(s)`,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(c => <span key={c} className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">{c}</span>)}
    </div>
  );
}

const duracion = (meses: number) => (meses < 12 ? `${meses} mes(es)` : `${Math.floor(meses / 12)} año(s)${meses % 12 ? ` ${meses % 12} m` : ''}`);
const formatearFecha = (f: string) => new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
