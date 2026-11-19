'use client'
import { useState } from 'react'
import type { Evaluacion, Empleado } from '@/lib/tipos'

interface PropsFormEval {
  evaluado: Empleado;
  tipo: string;
  titulo: string;
  descripcion: string;
  miId: number;
  evaluaciones: Evaluacion[];
  onSave: (evaluadoId: number, tipo: string, puntuacion: number, feedback: string) => Promise<void>;
  colorTheme: 'purple' | 'blue' | 'emerald';
}

export function FormEvaluacion({ evaluado, tipo, titulo, descripcion, miId, evaluaciones, onSave, colorTheme }: PropsFormEval) {
  const yaEvaluado = evaluaciones.find((e) => e.evaluador_id === miId && e.evaluado_id === evaluado.id && e.tipo === tipo);
  const [puntuacion, setPuntuacion] = useState(0); const [feedback, setFeedback] = useState("");
  const bgMap: Record<string, string> = { purple: 'bg-purple-50 border-purple-100', blue: 'bg-marca-50 border-marca-100', emerald: 'bg-emerald-50 border-emerald-100' };
  const textMap: Record<string, string> = { purple: 'text-purple-800', blue: 'text-marca-800', emerald: 'text-emerald-800' };
  if (yaEvaluado) {
    return (<div className={`p-6 rounded-2xl border opacity-80 ${bgMap[colorTheme]}`}><h4 className={`font-bold mb-1 ${textMap[colorTheme]}`}>✅ {titulo} completada</h4><div className="text-2xl tracking-widest my-2">{'⭐'.repeat(yaEvaluado.puntuacion)}</div><p className="text-xs text-slate-600 italic">"{yaEvaluado.feedback}"</p></div>)
  }
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <h4 className="font-bold text-marca-900 mb-1">{titulo}</h4><p className="text-xs text-slate-500 mb-4">{descripcion}</p>
      <div className="mb-4"><p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Puntuación (1 a 5)</p><div className="flex gap-2">{[1, 2, 3, 4, 5].map(num => (<button key={num} onClick={() => setPuntuacion(num)} className={`w-8 h-8 rounded-full font-bold text-sm transition-colors ${puntuacion >= num ? 'bg-amber-400 text-white shadow-inner' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200'}`}>★</button>))}</div></div>
      <textarea className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 outline-none focus:border-slate-400 mb-3 resize-none h-20" placeholder="Escribe tu retroalimentación detallada y constructiva..." value={feedback} onChange={e => setFeedback(e.target.value)}></textarea>
      <button onClick={() => onSave(evaluado.id, tipo, puntuacion, feedback)} className={`w-full text-white font-bold py-2 rounded-lg text-sm transition-colors ${puntuacion > 0 && feedback ? 'bg-marca-900 hover:bg-marca-800' : 'bg-slate-300 cursor-not-allowed'}`}>Enviar Evaluación</button>
    </div>
  )
}
