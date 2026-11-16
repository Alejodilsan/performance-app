'use client'
import { useMemo } from 'react'
import type { Area, Empleado } from '@/lib/tipos'
import {
  CELDAS_NINE_BOX, CELDAS_TALENTO_CLAVE, antiguedadAnios, clasificarNineBox, nivelRiesgo, senalesRetencion,
  type ConfiguracionBI, type SenalesSalariales,
} from '@/lib/bi'
import type { SenalesHistorial } from '@/lib/historial'

interface Props {
  empleados: Empleado[];
  areas: Area[];
  config: ConfiguracionBI;
  potencialEvaluado: Set<number>;
  /** Solo Admin: brecha contra la mediana del puesto y meses sin ajuste */
  senalesSalariales: Record<number, SenalesSalariales> | null;
  /** Señales del historial laboral (estancamiento, cambio de jefe, reubicaciones) */
  senalesHistorial: Record<number, SenalesHistorial>;
  onVerFicha: (emp: Empleado) => void;
}

/** Talento clave (Estrella, Futura estrella, Alto impacto) con señales de riesgo de fuga, ordenado por riesgo. */
export function TalentoEnRiesgo({ empleados, areas, config, potencialEvaluado, senalesSalariales, senalesHistorial, onVerFicha }: Props) {
  const filas = useMemo(() => empleados.flatMap(emp => {
    const c = clasificarNineBox(emp, config, potencialEvaluado);
    if (c.estado !== 'ok' || !CELDAS_TALENTO_CLAVE.includes(c.celda)) return [];
    const senales = senalesRetencion(emp, senalesSalariales?.[emp.id], senalesHistorial[emp.id]);
    return [{ emp, celda: CELDAS_NINE_BOX.find(d => d.id === c.celda)!.titulo, senales, nivel: nivelRiesgo(senales) }];
  }).sort((a, b) => b.senales.length - a.senales.length || b.emp.cumplimiento_general - a.emp.cumplimiento_general),
  [empleados, config, potencialEvaluado, senalesSalariales, senalesHistorial]);

  const enRiesgo = filas.filter(f => f.nivel);
  const nombreArea = (id: number | null) => areas.find(a => a.id === id)?.nombre || 'Sin área';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
      <h3 className="font-bold text-slate-800">🛡️ Talento clave en riesgo de fuga</h3>
      <p className="text-xs text-slate-500 mb-4">
        {filas.length} persona(s) de talento clave · <strong className="text-slate-700">{enRiesgo.length} con señales de riesgo</strong>.
        {!senalesSalariales && ' (Las señales salariales solo las ve el Admin.)'}
      </p>

      {filas.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Aún no hay talento clave identificado: evalúa el potencial de tu equipo.</p>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[380px] custom-scrollbar pr-1">
          {filas.map(({ emp, celda, senales, nivel }) => {
            const anios = antiguedadAnios(emp.fecha_ingreso);
            return (
              <div key={emp.id} className={`p-3 rounded-xl border ${nivel === 'alto' ? 'border-red-200 bg-red-50/40' : nivel === 'medio' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-slate-50/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{emp.nombre}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {emp.puesto} · {nombreArea(emp.area_id)} · {celda} · {emp.cumplimiento_general}%
                      {anios !== null && ` · ${anios < 1 ? '< 1 año' : `${Math.floor(anios)} año(s)`}`}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${nivel === 'alto' ? 'bg-red-100 text-red-800' : nivel === 'medio' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {nivel === 'alto' ? '! Riesgo alto' : nivel === 'medio' ? '◐ Riesgo medio' : '✓ Estable'}
                  </span>
                </div>
                {senales.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {senales.map(s => <span key={s.clave} className="text-[10px] text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{s.texto}</span>)}
                  </div>
                )}
                <button type="button" onClick={() => onVerFicha(emp)} className="text-[10px] font-bold text-blue-600 hover:underline mt-2">Ver curva de desempeño →</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
