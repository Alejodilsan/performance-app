'use client'
// Formulario de una evaluación 360: conductas por competencia (escala 1–5 o "no observado") y feedback guiado
// (seguir haciendo + consejo hacia adelante, con formato Situación → Comportamiento → Impacto).
import { useState } from 'react'
import { ESCALA, RELACIONES, validarRespuesta, type CompetenciaCuestionario, type Relacion } from '@/lib/evaluacion360'
import { responderEvaluacion, type PersonaMin } from '@/lib/evaluacion360Api'
import { mensajeDeError } from '@/lib/errores'

interface Props {
  asignacionId: number;
  evaluado: PersonaMin;
  relacion: Relacion;
  items: CompetenciaCuestionario[];
  minimoAnonimato: number;
  onCerrar: () => void;
  onEnviada: () => void;
}

type Borrador = { respuestas: Record<number, number | null>; fortaleza: string; consejo: string };
const claveBorrador = (id: number) => `ev360-borrador-${id}`;

function leerBorrador(id: number): Borrador {
  try {
    const crudo = localStorage.getItem(claveBorrador(id));
    if (crudo) return JSON.parse(crudo) as Borrador;
  } catch { /* sin almacenamiento local */ }
  return { respuestas: {}, fortaleza: '', consejo: '' };
}

const AVISO: Record<Relacion, (min: number) => string> = {
  auto: () => 'Tu autoevaluación no suma al resultado: se compara con la mirada de los demás para encontrar brechas de percepción.',
  lider: () => 'Como líder directo, tu evaluación no es anónima: la persona sabrá que viene de ti.',
  par: min => `Tu evaluación es anónima: se muestra agrupada y solo si hay al menos ${min} respuestas.`,
  colaborador: min => `Tu evaluación es anónima: tu líder solo verá resultados agrupados y solo si hay al menos ${min} respuestas.`,
};

export function FormularioEvaluacion({ asignacionId, evaluado, relacion, items, minimoAnonimato, onCerrar, onEnviada }: Props) {
  const [b, setB] = useState<Borrador>(() => leerBorrador(asignacionId));
  const [enviando, setEnviando] = useState(false);
  const total = items.reduce((s, c) => s + c.conductas.length, 0);
  const respondidas = items.reduce((s, c) => s + c.conductas.filter(x => x.id in b.respuestas).length, 0);
  const esAuto = relacion === 'auto';
  const sujeto = esAuto ? 'tú' : evaluado.nombre.split(' ')[0];

  function actualizar(cambio: Partial<Borrador>) {
    setB(prev => {
      const nuevo = { ...prev, ...cambio, respuestas: { ...prev.respuestas, ...(cambio.respuestas ?? {}) } };
      try { localStorage.setItem(claveBorrador(asignacionId), JSON.stringify(nuevo)); } catch { /* sin almacenamiento local */ }
      return nuevo;
    });
  }

  async function enviar() {
    const invalido = validarRespuesta(items, b.respuestas, b.fortaleza, b.consejo);
    if (invalido) return alert(invalido);
    if (!confirm('Una vez enviada, la evaluación no se puede modificar. ¿Enviar?')) return;
    setEnviando(true);
    try {
      await responderEvaluacion(asignacionId, b.respuestas, b.fortaleza, b.consejo);
      try { localStorage.removeItem(claveBorrador(asignacionId)); } catch { /* sin almacenamiento local */ }
      onEnviada();
    } catch (e) { alert(mensajeDeError(e)); setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-marca-950/40 backdrop-blur-sm flex justify-end" role="dialog" aria-modal="true" aria-label={`Evaluación de ${evaluado.nombre}`}>
      <div className="bg-fondo w-full max-w-3xl h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-right">
        <div className="sticky top-0 z-10 bg-white border-b border-marca-100 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-acento-700">{RELACIONES[relacion]}</p>
              <h3 className="text-lg font-extrabold text-marca-900">{esAuto ? 'Mi autoevaluación' : evaluado.nombre}</h3>
              {!esAuto && <p className="text-xs text-slate-500">{evaluado.puesto}</p>}
            </div>
            <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-marca-900 text-xl" aria-label="Cerrar">✕</button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-marca-50 rounded-full overflow-hidden">
              <div className="h-full bg-acento-500 transition-all" style={{ width: `${total ? (respondidas / total) * 100 : 0}%` }} />
            </div>
            <span className="text-[11px] font-bold text-marca-700">{respondidas}/{total}</span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs bg-marca-50 border border-marca-100 text-marca-800 rounded-2xl p-3">🔒 {AVISO[relacion](minimoAnonimato)} El borrador se guarda en este navegador mientras respondes.</p>

          <div className="bg-white border border-marca-100 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">¿Con qué frecuencia lo demuestra {sujeto}?</p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {ESCALA.map(e => (
                <div key={e.valor} className="text-[11px] text-slate-600"><strong className="text-marca-900">{e.valor} · {e.titulo}</strong><br />{e.descripcion}</div>
              ))}
            </div>
          </div>

          {items.map(c => (
            <section key={c.id} className="bg-white border border-marca-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-gradient-to-r from-marca-50 to-white border-b border-marca-100">
                <h4 className="font-extrabold text-marca-900 text-sm">{c.nombre} {c.grupo === 'liderazgo' && <span className="ml-1 text-[9px] font-black uppercase bg-marca-900 text-white px-2 py-0.5 rounded-full">Liderazgo</span>}</h4>
                {c.descripcion && <p className="text-[11px] text-slate-500">{c.descripcion}</p>}
              </div>
              <div className="divide-y divide-slate-100">
                {c.conductas.map(x => {
                  const v = b.respuestas[x.id];
                  const respondida = x.id in b.respuestas;
                  return (
                    <div key={x.id} className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                      <p className="flex-1 text-sm text-slate-700">{x.texto}</p>
                      <div className="flex items-center gap-1.5 shrink-0" role="radiogroup" aria-label={x.texto}>
                        {ESCALA.map(e => (
                          <button key={e.valor} type="button" role="radio" aria-checked={v === e.valor} title={`${e.titulo}: ${e.descripcion}`}
                            onClick={() => actualizar({ respuestas: { [x.id]: e.valor } })}
                            className={`w-9 h-9 rounded-xl text-sm font-bold border transition-colors ${v === e.valor ? 'bg-acento-600 border-acento-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-acento-400'}`}>
                            {e.valor}
                          </button>
                        ))}
                        <button type="button" role="radio" aria-checked={respondida && v === null} onClick={() => actualizar({ respuestas: { [x.id]: null } })}
                          className={`h-9 px-2 rounded-xl text-[10px] font-bold border leading-tight ${respondida && v === null ? 'bg-slate-600 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'}`}>
                          No lo he<br />observado
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="bg-white border border-marca-100 rounded-2xl p-5 space-y-4">
            <div>
              <h4 className="font-extrabold text-marca-900 text-sm">Feedback para crecer</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Usa el formato <strong>Situación → Comportamiento → Impacto</strong>. Ej.: <em>“En la presentación al cliente de marzo (S), explicaste el
                cronograma con ejemplos claros (C) y eso aceleró la aprobación (I).”</em>
              </p>
            </div>
            <label className="block">
              <span className="text-[10px] font-black uppercase text-acento-700">✅ ¿Qué debe seguir haciendo {sujeto}?</span>
              <textarea value={b.fortaleza} onChange={e => actualizar({ fortaleza: e.target.value })} maxLength={2000}
                className="mt-1 w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-acento-500 h-24 resize-none"
                placeholder="Una fortaleza concreta, con un ejemplo." />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase text-marca-600">🚀 Un consejo para el próximo período</span>
              <textarea value={b.consejo} onChange={e => actualizar({ consejo: e.target.value })} maxLength={2000}
                className="mt-1 w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-acento-500 h-24 resize-none"
                placeholder="Mira hacia adelante: ¿qué podría hacer distinto para tener más impacto? (no lo que hizo mal)" />
            </label>
          </section>

          <div className="flex justify-end gap-3 pb-6">
            <button type="button" onClick={onCerrar} className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-marca-900">Seguir después</button>
            <button type="button" onClick={enviar} disabled={enviando}
              className="px-6 py-2.5 text-sm font-bold text-white bg-acento-600 hover:bg-acento-700 disabled:opacity-50 rounded-xl">
              {enviando ? 'Enviando…' : 'Enviar evaluación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
