'use client'
import { useState } from 'react'
import type { Area, Empleado } from '@/lib/tipos'

interface Props {
  desvinculados: Empleado[];
  areas: Area[];
  onVerHistorial: (emp: Empleado) => void;
  onReactivar: (emp: Empleado) => Promise<void>;
}

export function SeccionDesvinculados({ desvinculados, areas, onVerHistorial, onReactivar }: Props) {
  const [abierta, setAbierta] = useState(false);
  if (desvinculados.length === 0) return null;

  const formatearFecha = (f?: string | null) =>
    f ? new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50/60 transition"
      >
        <div>
          <h3 className="text-sm font-bold text-marca-900">🗄️ Colaboradores desvinculados ({desvinculados.length})</h3>
          <p className="text-[11px] text-slate-500">Ya no forman parte de la organización. Su histórico se conserva.</p>
        </div>
        <span className="text-[10px] text-slate-500">{abierta ? '▲' : '▼'}</span>
      </button>

      {abierta && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="text-left font-bold px-5 py-2">Colaborador</th>
                <th className="text-left font-bold px-3 py-2">Última área</th>
                <th className="text-left font-bold px-3 py-2">Salida</th>
                <th className="text-left font-bold px-3 py-2">Motivo</th>
                <th className="text-right font-bold px-3 py-2">Último score</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {desvinculados.map(emp => (
                <tr key={emp.id} className="text-slate-700">
                  <td className="px-5 py-2.5">
                    <p className="font-bold text-marca-900">{emp.nombre}</p>
                    <p className="text-[10px] text-slate-500">{emp.puesto} • {emp.email}</p>
                  </td>
                  <td className="px-3 py-2.5">{areas.find(a => a.id === emp.area_id)?.nombre || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatearFecha(emp.fecha_desvinculacion)}</td>
                  <td className="px-3 py-2.5 max-w-[220px] truncate" title={emp.motivo_desvinculacion || ''}>{emp.motivo_desvinculacion || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{emp.cumplimiento_general}%</td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => onVerHistorial(emp)} className="text-[10px] font-bold text-marca-600 bg-marca-50 border border-marca-100 px-2.5 py-1 rounded-lg hover:bg-marca-100">
                        Historial
                      </button>
                      <button type="button" onClick={() => onReactivar(emp)} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg hover:bg-emerald-100">
                        Reactivar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
