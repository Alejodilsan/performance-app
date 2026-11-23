'use client'
// Pulso de seguimiento: 1 pregunta por competencia del PDI de la persona (escala 1–5 o "no observado") y un comentario.
import { useState } from 'react'
import { ESCALA, RELACIONES, type Relacion } from '@/lib/evaluacion360'
import { responderPulso, type PersonaMin } from '@/lib/evaluacion360Api'
import { mensajeDeError } from '@/lib/errores'

interface Props {
  asignacionId: number; evaluado: PersonaMin; relacion: Relacion; competencias: { id: number; nombre: string }[];
  onCerrar: () => void; onEnviado: () => void;
}

export function FormularioPulso({ asignacionId, evaluado, relacion, competencias, onCerrar, onEnviado }: Props) {
  const [puntajes, setPuntajes] = useState<Record<number, number | null>>({});
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const esAuto = relacion === 'auto';
  const sujeto = esAuto ? 'tú' : evaluado.nombre.split(' ')[0];

  async function enviar() {
    if (competencias.some(c => !(c.id in puntajes))) return alert('Responde cada competencia (o marca "no observado").');
    setEnviando(true);
    try { await responderPulso(asignacionId, puntajes, comentario); onEnviado(); }
    catch (e) { alert(mensajeDeError(e)); setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-marca-950/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Pulso de ${evaluado.nombre}`}>
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl animate-in fade-in">
        <div className="px-6 py-4 border-b border-marca-100 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-acento-700">Pulso de seguimiento · {RELACIONES[relacion]}</p>
            <h3 className="text-lg font-extrabold text-marca-900">{esAuto ? 'Mi avance' : evaluado.nombre}</h3>
            <p className="text-xs text-slate-500">Son {competencias.length} pregunta(s) sobre los focos de su plan de desarrollo. Toma menos de 2 minutos.</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-marca-900 text-xl" aria-label="Cerrar">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {competencias.map(c => (
            <div key={c.id}>
              <p className="text-sm font-bold text-marca-900">Hoy, ¿con qué frecuencia {esAuto ? 'demuestras' : `demuestra ${sujeto}`} <span className="text-acento-700">{c.nombre}</span>?</p>
              <div className="flex flex-wrap gap-1.5 mt-2" role="radiogroup" aria-label={c.nombre}>
                {ESCALA.map(e => (
                  <button key={e.valor} type="button" role="radio" aria-checked={puntajes[c.id] === e.valor} title={e.descripcion}
                    onClick={() => setPuntajes(p => ({ ...p, [c.id]: e.valor }))}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border ${puntajes[c.id] === e.valor ? 'bg-acento-600 border-acento-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-acento-400'}`}>
                    {e.valor} · {e.titulo}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={c.id in puntajes && puntajes[c.id] === null} onClick={() => setPuntajes(p => ({ ...p, [c.id]: null }))}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border ${c.id in puntajes && puntajes[c.id] === null ? 'bg-slate-600 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>No observado</button>
              </div>
            </div>
          ))}
          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-400">¿Qué avance {esAuto ? 'has logrado' : 'has notado'}? (opcional)</span>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={1000}
              className="mt-1 w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-acento-500 h-20 resize-none" placeholder="Un ejemplo concreto ayuda mucho." />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCerrar} className="px-4 py-2.5 text-sm font-bold text-slate-500">Cancelar</button>
            <button type="button" onClick={enviar} disabled={enviando} className="px-6 py-2.5 text-sm font-bold text-white bg-acento-600 hover:bg-acento-700 disabled:opacity-50 rounded-xl">{enviando ? 'Enviando…' : 'Enviar pulso'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
