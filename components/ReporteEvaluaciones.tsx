'use client'
import type { Evaluacion } from '@/lib/tipos'

interface Props {
  titulo: string;
  evaluaciones: Evaluacion[];
  nombrePorId: Map<number, string>;
  /** Oculta quién hizo las evaluaciones ascendentes (subordinado → jefe) para proteger su confidencialidad */
  anonimizarAscendentes?: boolean;
  vacio?: string;
}

export function ReporteEvaluaciones({ titulo, evaluaciones, nombrePorId, anonimizarAscendentes = false, vacio = 'Nadie ha enviado evaluaciones aún.' }: Props) {
  const ordenadas = [...evaluaciones].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
      <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <h3 className="font-bold text-marca-900">{titulo}</h3>
        <span className="text-xs font-bold text-slate-500">{evaluaciones.length} evaluación(es)</span>
      </div>
      <div className="p-6 grid gap-4">
        {ordenadas.length === 0 ? <p className="text-slate-400">{vacio}</p> : ordenadas.map(ev => {
          const anonima = anonimizarAscendentes && ev.tipo === 'ascendente';
          const evaluador = anonima ? 'Un colaborador' : nombrePorId.get(ev.evaluador_id) || 'Colaborador';
          const evaluado = nombrePorId.get(ev.evaluado_id) || 'Colaborador';
          return (
            <div key={ev.id} className="p-4 border border-slate-100 bg-slate-50 rounded-xl flex items-start gap-4">
              <div className="text-2xl pt-1">{'⭐'.repeat(ev.puntuacion)}</div>
              <div>
                <p className="text-sm font-bold text-marca-900">{evaluador} <span className="text-slate-400 font-normal">evaluó a</span> {evaluado}</p>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{ev.tipo}</span>
                <p className="text-sm text-slate-600 mt-2 italic">&quot;{ev.feedback}&quot;</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
