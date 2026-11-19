'use client'
import type { Area, Empleado } from '@/lib/tipos'
import { formatearCompacto, type ConfiguracionBI } from '@/lib/bi'
import type { CostosBI } from '@/lib/biApi'
import { coloresDesempeno } from '@/lib/umbrales'

interface Props {
  empleados: Empleado[];
  areas: Area[];
  config: ConfiguracionBI;
  costos: CostosBI | null;
}

/**
 * Por área: cumplimiento vs. costo. Con costos (Admin y líderes) muestra el costo empresa y su peso en la nómina;
 * sin costos (Auditor) solo el desempeño.
 */
export function EficienciaCosto({ empleados, areas, config, costos }: Props) {
  const filas: FilaArea[] = costos ? costos.porArea : agruparDesempeno(empleados, areas);
  const totalCosto = costos?.total.costoEmpresa || 0;
  const maxCosto = Math.max(...filas.map(f => f.costoEmpresa), 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
      <h3 className="font-bold text-marca-900">{costos ? '💰 Eficiencia del costo por área' : '📊 Desempeño por área'}</h3>
      <p className="text-xs text-slate-500 mb-4">
        {costos
          ? `Costo empresa mensual (salario × ${config.factor_prestacional.toLocaleString('es-CO')}) frente al cumplimiento promedio. Las áreas con alto costo y bajo cumplimiento se marcan para revisión.`
          : 'Cumplimiento promedio y headcount por área.'}
      </p>

      {filas.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Sin datos con los filtros actuales.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-400 tracking-wider border-b border-slate-100">
              <tr>
                <th className="text-left font-bold py-2 pr-2">Área</th>
                <th className="text-right font-bold py-2 px-2">Personas</th>
                <th className="text-right font-bold py-2 px-2">Cumplimiento</th>
                {costos && <th className="text-left font-bold py-2 px-2 min-w-[140px]">Costo empresa / mes</th>}
                {costos && <th className="text-right font-bold py-2 pl-2">Costo / persona</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filas.map(f => {
                const costo = f.costoEmpresa;
                const pesoNomina = totalCosto > 0 ? (costo / totalCosto) * 100 : 0;
                const color = coloresDesempeno(f.cumplimientoPromedio, config);
                // Alerta: pesa más que el promedio en la nómina y está bajo el umbral de desempeño
                const revisar = costos && pesoNomina >= 100 / Math.max(filas.length, 1) && f.cumplimientoPromedio < config.umbral_desempeno_bajo;
                return (
                  <tr key={String(f.areaId)}>
                    <td className="py-2 pr-2">
                      <span className="font-bold text-marca-900">{f.nombre}</span>
                      {revisar && <span className="ml-1.5 inline-block whitespace-nowrap text-[9px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full align-middle">! Revisar</span>}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700">{f.headcount}</td>
                    <td className={`py-2 px-2 text-right font-bold ${color.texto}`}>{f.cumplimientoPromedio}%</td>
                    {costos && (
                      <td className="py-2 px-2">
                        {f.personas > 0 ? (
                          <div className="flex items-center gap-2" title={`${pesoNomina.toFixed(1)}% de la nómina · ${f.personas} con salario registrado`}>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-slate-700" style={{ width: `${(costo / maxCosto) * 100}%` }} />
                            </div>
                            <span className="text-marca-900 font-semibold whitespace-nowrap">{formatearCompacto(costo, costos.moneda)}</span>
                          </div>
                        ) : <span className="text-slate-400">Sin salarios</span>}
                      </td>
                    )}
                    {costos && (
                      <td className="py-2 pl-2 text-right text-slate-700 whitespace-nowrap">
                        {f.personas > 0 ? formatearCompacto(costo / f.personas, costos.moneda) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type FilaArea = CostosBI['porArea'][number];

function agruparDesempeno(empleados: Empleado[], areas: Area[]): FilaArea[] {
  const mapa = new Map<number | null, { suma: number; headcount: number }>();
  empleados.forEach(e => {
    const f = mapa.get(e.area_id) ?? { suma: 0, headcount: 0 };
    f.suma += e.cumplimiento_general || 0; f.headcount++;
    mapa.set(e.area_id, f);
  });
  return [...mapa.entries()].map(([areaId, f]) => ({
    areaId, nombre: areaId === null ? 'Sin área' : areas.find(a => a.id === areaId)?.nombre || 'Área',
    headcount: f.headcount, personas: 0, base: 0, costoEmpresa: 0, cumplimientoPromedio: Math.round(f.suma / f.headcount),
  })).sort((a, b) => b.cumplimientoPromedio - a.cumplimientoPromedio);
}
