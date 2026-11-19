'use client'
import type { Empleado } from '@/lib/tipos'
import type { CostosBI } from '@/lib/biApi'

interface Props {
  empleados: Empleado[];
  potencialEvaluado: Set<number>;
  /** null si este usuario no ve costos: entonces no se muestra la fila de salario */
  costos: CostosBI | null;
  onCompletar?: () => void;
}

/** Qué tan completos están los datos que alimentan el BI. Lo incompleto hace que los indicadores mientan. */
export function CalidadDatos({ empleados, potencialEvaluado, costos, onCompletar }: Props) {
  const total = empleados.length;
  if (total === 0) return null;
  const cuenta = (f: (e: Empleado) => boolean) => empleados.filter(f).length;
  const filas = [
    { dato: 'KPIs asignados', usado: 'Eje de desempeño', n: cuenta(e => !!e.indicadores?.length) },
    { dato: 'Potencial evaluado', usado: 'Nine Box y talento clave', n: cuenta(e => potencialEvaluado.has(e.id)) },
    ...(costos ? [{ dato: 'Salario registrado', usado: 'Costos y riesgo salarial', n: costos.total.personas + costos.otrasMonedas.reduce((s, o) => s + o.personas, 0) }] : []),
    { dato: 'Fecha de ingreso', usado: 'Antigüedad y estancamiento', n: cuenta(e => !!e.fecha_ingreso) },
    { dato: 'Jefe directo', usado: 'Alcance y cambio de jefe', n: cuenta(e => !!e.jefe_directo_id) },
    { dato: 'Tipo de contrato', usado: 'Filtros y estructura', n: cuenta(e => !!e.tipo_contrato) },
    { dato: 'Sede', usado: 'Filtros y estructura', n: cuenta(e => !!e.sede?.trim()) },
  ];
  const promedio = Math.round(filas.reduce((s, f) => s + f.n / total, 0) / filas.length * 100);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-marca-900">🧩 Calidad de datos · {promedio}% completo</h3>
          <p className="text-xs text-slate-500">Los indicadores solo son confiables si estos datos están completos.</p>
        </div>
        {onCompletar && promedio < 100 && (
          <button type="button" onClick={onCompletar} className="text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 px-3 py-1.5 rounded-lg">
            📥 Completar con importación
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
        {filas.map(f => {
          const pct = Math.round((f.n / total) * 100);
          return (
            <div key={f.dato} className="text-xs" title={`${f.n} de ${total} · se usa en: ${f.usado}`}>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 font-semibold">{f.dato} <span className="font-normal text-slate-400">· {f.usado}</span></span>
                <span className="text-marca-900 font-bold tabular-nums">{pct}% <span className="font-normal text-slate-400">({total - f.n} pend.)</span></span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-600' : pct >= 60 ? 'bg-amber-500' : 'bg-red-700'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
