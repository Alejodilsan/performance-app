'use client'
import { useMemo, useState } from 'react'
import type { Area, Empleado } from '@/lib/tipos'
import { CELDAS_NINE_BOX, clasificarNineBox, formatearCompacto, type Accion, type CeldaId, type ConfiguracionBI } from '@/lib/bi'
import type { CostosBI } from '@/lib/biApi'

// Colores de acción validados para daltonismo (verde · azul · ámbar · rojo). Siempre van con ícono + texto.
export const ESTILO_ACCION: Record<Accion, { etiqueta: string; icono: string; fondo: string; borde: string; acento: string; chip: string }> = {
  retener: { etiqueta: 'Retener', icono: '★', fondo: 'bg-emerald-50', borde: 'border-emerald-200', acento: '#059669', chip: 'bg-emerald-100 text-emerald-800' },
  desarrollar: { etiqueta: 'Desarrollar', icono: '↗', fondo: 'bg-marca-50', borde: 'border-marca-200', acento: '#2563eb', chip: 'bg-marca-100 text-marca-800' },
  observar: { etiqueta: 'Observar', icono: '◐', fondo: 'bg-amber-50', borde: 'border-amber-200', acento: '#f59e0b', chip: 'bg-amber-100 text-amber-800' },
  actuar: { etiqueta: 'Actuar', icono: '!', fondo: 'bg-red-50', borde: 'border-red-200', acento: '#b91c1c', chip: 'bg-red-100 text-red-800' },
};

type Seleccion = CeldaId | 'sin_potencial' | 'sin_kpis' | null;

interface Props {
  empleados: Empleado[];
  areas: Area[];
  config: ConfiguracionBI;
  potencialEvaluado: Set<number>;
  costos: CostosBI | null;
  onVerFicha: (emp: Empleado) => void;
}

const NIVEL = ['', 'Bajo', 'Medio', 'Alto'];

export function NineBox({ empleados, areas, config, potencialEvaluado, costos, onVerFicha }: Props) {
  const [seleccion, setSeleccion] = useState<Seleccion>(null);

  const { porCelda, sinPotencial, sinKpis, clasificados } = useMemo(() => {
    const porCelda = new Map<CeldaId, Empleado[]>();
    const sinPotencial: Empleado[] = [];
    const sinKpis: Empleado[] = [];
    empleados.forEach(emp => {
      const c = clasificarNineBox(emp, config, potencialEvaluado);
      if (c.estado === 'ok') porCelda.set(c.celda, [...(porCelda.get(c.celda) || []), emp]);
      else if (c.estado === 'sin_kpis') sinKpis.push(emp);
      else sinPotencial.push(emp);
    });
    porCelda.forEach(lista => lista.sort((a, b) => b.cumplimiento_general - a.cumplimiento_general));
    return { porCelda, sinPotencial, sinKpis, clasificados: empleados.length - sinPotencial.length - sinKpis.length };
  }, [empleados, config, potencialEvaluado]);

  const nombreArea = (id: number | null) => areas.find(a => a.id === id)?.nombre || 'Sin área';
  const listaSeleccion = seleccion === 'sin_potencial' ? sinPotencial : seleccion === 'sin_kpis' ? sinKpis : seleccion ? porCelda.get(seleccion) || [] : [];
  const celdaSel = CELDAS_NINE_BOX.find(c => c.id === seleccion);
  const umbralTexto = [`< ${config.umbral_desempeno_bajo}%`, `${config.umbral_desempeno_bajo}–${config.umbral_desempeno_alto - 1}%`, `≥ ${config.umbral_desempeno_alto}%`];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-marca-900">Matriz de talento (Nine Box)</h2>
          <p className="text-xs text-slate-500">
            {clasificados} de {empleados.length} colaboradores clasificados por desempeño (KPIs) y potencial evaluado.
            {' '}Haz clic en una casilla para ver quiénes están y qué hacer.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Leyenda de acciones">
          {(Object.keys(ESTILO_ACCION) as Accion[]).map(a => (
            <span key={a} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTILO_ACCION[a].chip}`}>
              {ESTILO_ACCION[a].icono} {ESTILO_ACCION[a].etiqueta}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {/* Eje Y: potencial */}
        <div className="flex flex-col w-14 shrink-0">
          {[3, 2, 1].map(p => (
            <div key={p} className="flex-1 flex flex-col items-end justify-center pr-1 text-right">
              <span className="text-[11px] font-bold text-slate-600">{NIVEL[p]}</span>
              <span className="text-[9px] text-slate-400 uppercase">potencial</span>
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-3 gap-2">
            {CELDAS_NINE_BOX.map(def => {
              const lista = porCelda.get(def.id) || [];
              const est = ESTILO_ACCION[def.accion];
              const pct = clasificados > 0 ? Math.round((lista.length / clasificados) * 100) : 0;
              const costoCelda = costos?.porCelda[def.id];
              const activa = seleccion === def.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setSeleccion(activa ? null : def.id)}
                  aria-pressed={activa}
                  title={def.recomendacion}
                  className={`text-left rounded-xl border p-3 min-h-[118px] flex flex-col transition-all ${est.fondo} ${est.borde} ${
                    activa ? 'ring-2 ring-offset-2 ring-marca-900' : 'hover:shadow-md'
                  } ${lista.length === 0 ? 'opacity-60' : ''}`}
                  style={{ borderTopWidth: 4, borderTopColor: est.acento }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-marca-900 truncate">{def.titulo}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-500">{est.icono} {est.etiqueta}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black text-marca-900 leading-none">{lista.length}</p>
                      <p className="text-[10px] text-slate-500">{pct}%</p>
                    </div>
                  </div>
                  {/* Iniciales de las personas (máx. 6) */}
                  <div className="flex -space-x-1 mt-auto pt-2">
                    {lista.slice(0, 6).map(emp => (
                      <span key={emp.id} title={`${emp.nombre} · ${emp.cumplimiento_general}%`}
                        className="w-7 h-7 rounded-full bg-white border-2 border-white ring-1 ring-slate-200 text-[9px] font-bold text-slate-700 flex items-center justify-center shrink-0">
                        {iniciales(emp.nombre)}
                      </span>
                    ))}
                    {lista.length > 6 && (
                      <span className="w-7 h-7 rounded-full bg-slate-700 border-2 border-white text-[9px] font-bold text-white flex items-center justify-center shrink-0">+{lista.length - 6}</span>
                    )}
                  </div>
                  {costoCelda && costoCelda.personas > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1.5">💰 {formatearCompacto(costoCelda.costoEmpresa, costos!.moneda)}/mes</p>
                  )}
                </button>
              );
            })}
          </div>
          {/* Eje X: desempeño */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[1, 2, 3].map(d => (
              <div key={d} className="text-center">
                <span className="text-[11px] font-bold text-slate-600">{NIVEL[d]} desempeño</span>
                <span className="block text-[9px] text-slate-400">{umbralTexto[d - 1]} de cumplimiento</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sin clasificar: no se asume "bajo" */}
      {(sinPotencial.length > 0 || sinKpis.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500">Sin clasificar:</span>
          {sinPotencial.length > 0 && (
            <button type="button" onClick={() => setSeleccion(seleccion === 'sin_potencial' ? null : 'sin_potencial')}
              className={`text-[11px] font-bold px-3 py-1 rounded-full border ${seleccion === 'sin_potencial' ? 'bg-marca-900 text-white border-marca-900' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'}`}>
              {sinPotencial.length} sin evaluación de potencial
            </button>
          )}
          {sinKpis.length > 0 && (
            <button type="button" onClick={() => setSeleccion(seleccion === 'sin_kpis' ? null : 'sin_kpis')}
              className={`text-[11px] font-bold px-3 py-1 rounded-full border ${seleccion === 'sin_kpis' ? 'bg-marca-900 text-white border-marca-900' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'}`}>
              {sinKpis.length} sin KPIs asignados
            </button>
          )}
        </div>
      )}

      {/* Detalle de la selección */}
      {seleccion && (
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in">
          <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-marca-900">
                {celdaSel ? `${celdaSel.titulo} · ${NIVEL[Number(celdaSel.id[0])]} potencial / ${NIVEL[Number(celdaSel.id[2])]} desempeño`
                  : seleccion === 'sin_potencial' ? 'Sin evaluación de potencial' : 'Sin KPIs asignados'}
              </p>
              <p className="text-[11px] text-slate-500">
                {celdaSel ? `Qué hacer: ${celdaSel.recomendacion}`
                  : seleccion === 'sin_potencial' ? 'Qué hacer: evalúa su potencial desde su tarjeta para ubicarlos en la matriz.'
                  : 'Qué hacer: asígnales KPIs; sin ellos su cumplimiento no mide nada.'}
              </p>
            </div>
            <button type="button" onClick={() => setSeleccion(null)} className="text-xs font-bold text-slate-500 hover:text-marca-900">Cerrar ✕</button>
          </div>
          {listaSeleccion.length === 0 ? (
            <p className="text-xs text-slate-400 italic p-4">Nadie en esta casilla con los filtros actuales.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="bg-white text-[10px] uppercase text-slate-400 tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left font-bold px-4 py-2">Colaborador</th>
                    <th className="text-left font-bold px-3 py-2">Área</th>
                    <th className="text-right font-bold px-3 py-2">Cumplimiento</th>
                    <th className="text-left font-bold px-3 py-2">Potencial</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listaSeleccion.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2"><p className="font-bold text-marca-900">{emp.nombre}</p><p className="text-[10px] text-slate-500">{emp.puesto}</p></td>
                      <td className="px-3 py-2 text-slate-600">{nombreArea(emp.area_id)}</td>
                      <td className="px-3 py-2 text-right font-bold text-marca-900">{emp.indicadores?.length ? `${emp.cumplimiento_general}%` : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{potencialEvaluado.has(emp.id) && emp.potencial_score ? NIVEL[emp.potencial_score] : 'Sin evaluar'}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => onVerFicha(emp)} className="text-[10px] font-bold text-marca-600 bg-marca-50 border border-marca-100 px-2.5 py-1 rounded-lg hover:bg-marca-100">Ver curva</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
