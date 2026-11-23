'use client'
// BI · Evaluación 360 y desarrollo: participación, resultados por competencia, brechas de percepción, entrega 1:1,
// planes de desarrollo (70-20-10), check-ins, pulso y correlación con el cumplimiento de KPIs. Todo agregado en el servidor.
import { useEffect, useState } from 'react'
import type { FiltrosBI } from '@/lib/bi'
import { cargarIndicadores360, type Indicadores360 as Datos } from '@/lib/evaluacion360Api'
import { formatoPuntaje } from '@/lib/evaluacion360'
import { TIPOS_ACCION, interpretarCorrelacion, type TipoAccion } from '@/lib/desarrollo'
import { mensajeDeError } from '@/lib/errores'

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export function Indicadores360({ filtros }: { filtros: FiltrosBI }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarIndicadores360(filtros)
      .then(r => { if (vigente) { setD(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [filtros]);

  if (error) return <div className="bg-white rounded-3xl border border-slate-100 p-5 text-xs text-slate-500">🔄 Evaluación 360: {error}</div>;
  if (!d) return null;
  if (!d.ciclo && d.desarrollo.conPlan === 0) {
    return (
      <div className="bg-white rounded-3xl border border-dashed border-marca-200 p-5 text-sm text-slate-500">
        🔄 <strong className="text-marca-900">Evaluación 360 y desarrollo:</strong> aún no hay ciclos con resultados ni planes de desarrollo para esta población.
      </div>
    );
  }
  const max = Math.max(5, ...d.competencias.map(c => c.promedio ?? 0));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-marca-900 text-lg">🔄 Evaluación 360 y desarrollo</h3>
          <p className="text-xs text-slate-500">{d.ciclo ? `${d.ciclo.nombre}${d.anterior ? ` · comparado con ${d.anterior}` : ''}` : 'Sin ciclo con resultados'} · {d.personas} persona(s) en el filtro</p>
        </div>
        <p className="text-[10px] text-slate-400 max-w-sm text-right">Por anonimato, los promedios se muestran solo con {d.minimo} o más personas. Escala 1–5.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Dato titulo="Participación" valor={pct(d.completadas, d.asignadas)} detalle={`${d.completadas}/${d.asignadas} evaluaciones`} />
        <Dato titulo="Resultado 360" valor={formatoPuntaje(d.global)} destacado
          detalle={d.variacion === null ? `${d.conResultado} con resultado` : `${d.variacion >= 0 ? '▲ +' : '▼ '}${formatoPuntaje(d.variacion)} vs. anterior`} />
        <Dato titulo="Brecha de percepción" valor={d.brecha === null ? '—' : `${d.brecha > 0 ? '+' : ''}${formatoPuntaje(d.brecha)}`} detalle="autoevaluación − resultado" alerta={d.brecha !== null && d.brecha >= 0.5} />
        <Dato titulo="Con puntos ciegos" valor={d.conPuntoCiego === null ? '—' : String(d.conPuntoCiego)} detalle={`de ${d.conResultado} personas`} />
        <Dato titulo="Entregas 1:1" valor={pct(d.conversados, d.conResultado)} detalle={`${d.conversados} conversadas`} />
        <Dato titulo="Con plan de desarrollo" valor={pct(d.desarrollo.conPlan, d.personas)} detalle={`${d.desarrollo.conPlan} persona(s) · ${d.desarrollo.logrados} logrados`} />
        <Dato titulo="Acciones completadas" valor={pct(d.desarrollo.accionesHechas, d.desarrollo.acciones)} detalle={`${d.desarrollo.accionesHechas}/${d.desarrollo.acciones}`} />
        <Dato titulo="Check-ins al día" valor={pct(d.desarrollo.checkinAlDia, d.desarrollo.conPlan)} detalle="de quienes tienen plan" alerta={d.desarrollo.conPlan > 0 && d.desarrollo.checkinAlDia / d.desarrollo.conPlan < 0.5} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Resultado por competencia</p>
          {d.competencias.length === 0 ? <p className="text-xs text-slate-400">Sin datos.</p> : (
            <div className="space-y-1.5">
              {d.competencias.map(c => (
                <div key={c.nombre} className="flex items-center gap-3 text-xs">
                  <span className="w-48 truncate text-slate-600 font-bold" title={c.nombre}>{c.nombre}</span>
                  <div className="flex-1 h-3 bg-marca-50 rounded-full overflow-hidden">
                    {c.promedio !== null && <div className={`h-full rounded-full ${c.promedio >= 4 ? 'bg-acento-500' : c.promedio >= 3 ? 'bg-marca-400' : 'bg-amber-400'}`} style={{ width: `${(c.promedio / max) * 100}%` }} />}
                  </div>
                  <span className="w-10 text-right font-extrabold text-marca-900">{formatoPuntaje(c.promedio)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Mezcla de acciones de desarrollo</p>
            {d.desarrollo.acciones === 0 ? <p className="text-xs text-slate-400">Sin acciones registradas.</p> : (
              <>
                <div className="flex h-4 rounded-full overflow-hidden">
                  {(Object.keys(TIPOS_ACCION) as TipoAccion[]).map((t, i) => (
                    <div key={t} className={['bg-acento-500', 'bg-marca-400', 'bg-amber-400'][i]} style={{ width: `${d.desarrollo.mezcla[t]}%` }} title={`${TIPOS_ACCION[t].titulo}: ${d.desarrollo.mezcla[t]}%`} />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {(Object.keys(TIPOS_ACCION) as TipoAccion[]).map(t => `${TIPOS_ACCION[t].titulo} ${d.desarrollo.mezcla[t]}%`).join(' · ')} <span className="text-slate-400">(sugerido 70 · 20 · 10)</span>
                </p>
              </>
            )}
          </div>
          {d.pulso && (
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Pulso de seguimiento {d.pulso.estado === 'abierto' && '(abierto)'}</p>
              <p className={`font-titulo text-2xl font-extrabold ${d.pulso.delta === null ? 'text-slate-300' : d.pulso.delta >= 0 ? 'text-acento-700' : 'text-amber-700'}`}>
                {d.pulso.delta === null ? '—' : `${d.pulso.delta >= 0 ? '+' : ''}${formatoPuntaje(d.pulso.delta)}`}
              </p>
              <p className="text-[11px] text-slate-500">variación promedio en los focos del PDI · {d.pulso.personas} persona(s) con respuestas</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">360 vs. cumplimiento de KPIs</p>
            <p className="font-titulo text-2xl font-extrabold text-marca-900">{d.correlacion === null ? '—' : `r = ${d.correlacion.toFixed(2).replace('.', ',')}`}</p>
            <p className="text-[11px] text-slate-500">{interpretarCorrelacion(d.correlacion)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, detalle, destacado, alerta }: { titulo: string; valor: string; detalle?: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className={`p-3 rounded-2xl border ${destacado ? 'bg-marca-900 border-marca-800 text-white' : 'bg-slate-50/60 border-slate-100'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">{titulo}</p>
      <p className={`text-xl font-black mt-1 ${destacado ? 'text-white' : 'text-marca-900'}`}>{valor}</p>
      {detalle && <p className={`text-[10px] mt-0.5 ${alerta ? 'text-red-700 font-semibold' : destacado ? 'text-slate-300' : 'text-slate-500'}`}>{detalle}</p>}
    </div>
  );
}
