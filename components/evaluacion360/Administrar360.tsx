'use client'
// Administración de la 360 (Admin): ciclos y fases, avance de respuestas, calibración (distribución y tendencia de
// evaluadores) y la biblioteca de competencias.
import { useState } from 'react'
import {
  FASES, ESCALA, siguienteEstado, sugerirCiclo, validarCiclo, conResultados, formatoPuntaje,
  type Ciclo, type Competencia, type Frecuencia, type GrupoCompetencia,
} from '@/lib/evaluacion360'
import {
  avanzarFase, cargarBibliotecaBase, cerrarPulso, lanzarPulso, eliminarCiclo, eliminarCompetencia, guardarCiclo, guardarCompetencia, reabrirEvaluacion,
  type DatosCiclo, type DatosCompetencia, type RespuestaEv360,
} from '@/lib/evaluacion360Api'
import { mensajeDeError } from '@/lib/errores'

interface Props { datos: RespuestaEv360; onCambio: (cicloId?: number) => void }

const inputCls = 'w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-acento-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

const CONFIRMAR: Partial<Record<Ciclo['estado'], string>> = {
  borrador: 'Se congelará el cuestionario con las competencias activas y se crearán las evaluaciones automáticas (autoevaluación, líder y colaboradores) para todos los colaboradores activos. Luego los líderes eligen los pares. ¿Lanzar?',
  nominacion: 'Se abrirá la ventana de evaluación: todos podrán responder. Los líderes aún podrán agregar pares. ¿Continuar?',
  evaluacion: 'Se cerrará la ventana de evaluación (las pendientes quedan sin responder) y comenzará la calibración. ¿Continuar?',
  calibracion: 'Se cerrará la calibración. Los líderes podrán conversar los resultados y, al registrarlo, cada persona verá su informe. ¿Continuar?',
  resultados: 'Se cerrará el ciclo: queda como histórico y ya no se registran conversaciones. ¿Cerrar?',
};

export function Administrar360({ datos, onCambio }: Props) {
  const [editando, setEditando] = useState<DatosCiclo | null>(null);
  const ciclo = datos.ciclo;

  async function ejecutar(f: () => Promise<unknown>, cicloId?: number) {
    try { await f(); onCambio(cicloId); } catch (e) { alert(mensajeDeError(e)); }
  }

  function nuevo(frecuencia: Frecuencia = datos.ciclos[0]?.frecuencia ?? 'semestral') {
    const anterior = datos.ciclos[0];
    setEditando({
      ...sugerirCiclo(frecuencia),
      peso_lider: anterior?.peso_lider ?? 40, peso_pares: anterior?.peso_pares ?? 30, peso_colaboradores: anterior?.peso_colaboradores ?? 30,
      minimo_anonimato: anterior?.minimo_anonimato ?? 3,
    });
  }

  return (
    <div className="space-y-6">
      {/* Ciclo seleccionado */}
      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-marca-900">Ciclos de evaluación</h3>
            <p className="text-xs text-slate-500">Un ciclo por corte (semestral o anual). Solo puede haber uno en curso a la vez.</p>
          </div>
          <button type="button" onClick={() => nuevo()} className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">+ Nuevo ciclo</button>
        </div>

        {ciclo && (
          <div className="mt-4 border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 space-y-0.5">
              <p className="font-bold text-marca-900 text-sm">{ciclo.nombre}</p>
              <p>Período evaluado: {ciclo.periodo_desde} → {ciclo.periodo_hasta} · {ciclo.frecuencia}</p>
              <p>Pesos: líder {ciclo.peso_lider}% · pares {ciclo.peso_pares}% · colaboradores {ciclo.peso_colaboradores}% · grupos anónimos desde {ciclo.minimo_anonimato} respuestas</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ciclo.estado !== 'resultados' && ciclo.estado !== 'cerrado' && (
                <button type="button" onClick={() => setEditando({ ...ciclo, cuestionario: undefined } as DatosCiclo)} className="px-3 py-2 text-xs font-bold text-marca-700 bg-marca-50 hover:bg-marca-100 rounded-xl">Editar</button>
              )}
              {ciclo.estado === 'borrador' && (
                <button type="button" onClick={() => confirm('¿Eliminar este borrador?') && ejecutar(() => eliminarCiclo(ciclo.id))} className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl">Eliminar</button>
              )}
              {ciclo.estado === 'calibracion' && (
                <button type="button" onClick={() => confirm('¿Reabrir la ventana de evaluación para recibir respuestas pendientes?') && ejecutar(() => reabrirEvaluacion(ciclo.id), ciclo.id)}
                  className="px-3 py-2 text-xs font-bold text-marca-700 bg-marca-50 hover:bg-marca-100 rounded-xl">↩ Reabrir evaluación</button>
              )}
              {siguienteEstado(ciclo.estado) && (
                <button type="button" onClick={() => confirm(CONFIRMAR[ciclo.estado] ?? '¿Continuar?') && ejecutar(() => avanzarFase(ciclo.id), ciclo.id)}
                  className="px-4 py-2 text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 rounded-xl">
                  {ciclo.estado === 'borrador' ? '🚀 Lanzar ciclo' : `Pasar a ${FASES.find(f => f.estado === siguienteEstado(ciclo.estado))!.titulo.toLowerCase()} →`}
                </button>
              )}
            </div>
          </div>
        )}
        {!ciclo && <p className="text-sm text-slate-400 mt-4">Aún no hay ciclos. Crea el primero.</p>}
      </div>

      {editando && <FormularioCiclo key={`${editando.id ?? 'nuevo'}-${editando.frecuencia}`} inicial={editando} onCancelar={() => setEditando(null)}
        onGuardar={d => ejecutar(async () => { const r = await guardarCiclo(d); setEditando(null); return r; }, editando.id)} onFrecuencia={f => !editando.id && nuevo(f)} />}

      {ciclo && (datos.pulso || datos.puedeLanzarPulso) && <PanelPulso datos={datos} ejecutar={f => ejecutar(f, ciclo.id)} />}

      {ciclo && conResultados(ciclo.estado) && datos.calibracion && <PanelCalibracion datos={datos} />}

      <Biblioteca biblioteca={datos.biblioteca ?? []} onCambio={() => onCambio(ciclo?.id)} />
    </div>
  );
}

function FormularioCiclo({ inicial, onCancelar, onGuardar, onFrecuencia }: {
  inicial: DatosCiclo; onCancelar: () => void; onGuardar: (d: DatosCiclo) => void; onFrecuencia: (f: Frecuencia) => void;
}) {
  const [d, setD] = useState<DatosCiclo>(inicial);
  const set = <K extends keyof DatosCiclo>(k: K, v: DatosCiclo[K]) => setD(prev => ({ ...prev, [k]: v }));
  const lanzado = !!inicial.id && (inicial as Partial<Ciclo>).estado !== 'borrador';
  const suma = d.peso_lider + d.peso_pares + d.peso_colaboradores;
  return (
    <div className="bg-white rounded-3xl border border-acento-200 p-5 space-y-4">
      <h3 className="font-extrabold text-marca-900">{inicial.id ? 'Editar ciclo' : 'Nuevo ciclo'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="md:col-span-2"><span className={labelCls}>Nombre</span><input className={inputCls} value={d.nombre} onChange={e => set('nombre', e.target.value)} /></label>
        <label><span className={labelCls}>Corte</span>
          <select className={inputCls} value={d.frecuencia} disabled={lanzado || !!inicial.id} onChange={e => onFrecuencia(e.target.value as Frecuencia)}>
            <option value="semestral">Semestral</option><option value="anual">Anual</option>
          </select>
        </label>
        <label><span className={labelCls}>Período evaluado desde</span><input type="date" className={inputCls} value={d.periodo_desde} disabled={lanzado} onChange={e => set('periodo_desde', e.target.value)} /></label>
        <label><span className={labelCls}>Hasta</span><input type="date" className={inputCls} value={d.periodo_hasta} disabled={lanzado} onChange={e => set('periodo_hasta', e.target.value)} /></label>
        <div />
        <label><span className={labelCls}>Nominación de pares hasta</span><input type="date" className={inputCls} value={d.nominacion_hasta ?? ''} onChange={e => set('nominacion_hasta', e.target.value || null)} /></label>
        <label><span className={labelCls}>Evaluación hasta</span><input type="date" className={inputCls} value={d.evaluacion_hasta ?? ''} onChange={e => set('evaluacion_hasta', e.target.value || null)} /></label>
        <label><span className={labelCls}>Calibración hasta</span><input type="date" className={inputCls} value={d.calibracion_hasta ?? ''} onChange={e => set('calibracion_hasta', e.target.value || null)} /></label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([['peso_lider', 'Peso líder %'], ['peso_pares', 'Peso pares %'], ['peso_colaboradores', 'Peso colaboradores %'], ['minimo_anonimato', 'Mínimo para anonimato']] as const).map(([k, t]) => (
          <label key={k}><span className={labelCls}>{t}</span><input type="number" min={0} max={100} className={inputCls} value={d[k]} onChange={e => set(k, Number(e.target.value))} /></label>
        ))}
      </div>
      <p className={`text-[11px] ${suma === 100 ? 'text-slate-500' : 'text-red-600 font-bold'}`}>
        Los pesos suman {suma}% (deben sumar 100). La autoevaluación no suma: se usa para medir la brecha de percepción. Si una persona no tiene
        alguna perspectiva (p. ej. no tiene equipo), su peso se reparte entre las demás.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button>
        <button type="button" onClick={() => { const err = validarCiclo(d); if (err) alert(err); else onGuardar(d); }} className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">Guardar</button>
      </div>
    </div>
  );
}

function PanelCalibracion({ datos }: { datos: RespuestaEv360 }) {
  const cal = datos.calibracion!;
  const max = Math.max(1, ...cal.distribucion.tramos.map(t => t.n));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <h3 className="font-extrabold text-marca-900 text-sm">Distribución de resultados</h3>
        <p className="text-[11px] text-slate-500 mb-4">Resultado global (1–5) de cada persona. Úsalo para conversar con los líderes si un área está muy arriba o muy abajo.</p>
        <div className="space-y-2">
          {cal.distribucion.tramos.map(t => (
            <div key={t.etiqueta} className="flex items-center gap-3 text-xs">
              <span className="w-16 text-right text-slate-500 font-bold">{t.etiqueta}</span>
              <div className="flex-1 h-5 bg-marca-50 rounded-lg overflow-hidden"><div className="h-full bg-acento-500 rounded-lg" style={{ width: `${(t.n / max) * 100}%` }} /></div>
              <span className="w-8 font-bold text-marca-900">{t.n}</span>
            </div>
          ))}
        </div>
        {cal.distribucion.sinDatos > 0 && <p className="text-[11px] text-slate-400 mt-3">{cal.distribucion.sinDatos} persona(s) sin evaluaciones suficientes.</p>}
      </div>
      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <h3 className="font-extrabold text-marca-900 text-sm">Tendencia de los evaluadores</h3>
        <p className="text-[11px] text-slate-500 mb-4">Promedio que asigna cada evaluador (3 o más evaluaciones) frente al promedio de la empresa ({formatoPuntaje(cal.sesgo.general)}). No muestra qué respondió a cada persona.</p>
        {cal.sesgo.evaluadores.length === 0 ? <p className="text-sm text-slate-400">Aún no hay evaluadores con 3 o más evaluaciones.</p> : (
          <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto custom-scrollbar">
            {cal.sesgo.evaluadores.map(s => (
              <li key={s.evaluador.id} className="py-2 flex items-center justify-between text-xs">
                <span className="font-bold text-marca-900">{s.evaluador.nombre}<span className="block font-normal text-[10px] text-slate-400">{s.n} evaluaciones</span></span>
                <span className={`font-extrabold ${s.alerta ? (s.diferencia > 0 ? 'text-amber-700' : 'text-red-600') : 'text-slate-500'}`}>
                  {formatoPuntaje(s.promedio)} ({s.diferencia > 0 ? '+' : ''}{formatoPuntaje(s.diferencia)}){s.alerta && (s.diferencia > 0 ? ' · benévolo' : ' · exigente')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Biblioteca({ biblioteca, onCambio }: { biblioteca: Competencia[]; onCambio: () => void }) {
  const [edicion, setEdicion] = useState<DatosCompetencia | null>(null);
  async function ejecutar(f: () => Promise<unknown>) {
    try { await f(); setEdicion(null); onCambio(); } catch (e) { alert(mensajeDeError(e)); }
  }
  const grupos: { grupo: GrupoCompetencia; titulo: string; ayuda: string }[] = [
    { grupo: 'corporativa', titulo: 'Corporativas', ayuda: 'Se evalúan a todas las personas.' },
    { grupo: 'liderazgo', titulo: 'Liderazgo', ayuda: 'Solo a quienes tienen equipo a cargo.' },
  ];
  return (
    <div className="bg-white rounded-3xl border border-marca-100 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-marca-900">Biblioteca de competencias</h3>
          <p className="text-xs text-slate-500">Cada conducta se califica de 1 a 5 ({ESCALA.map(e => e.titulo.toLowerCase()).join(', ')}) o “no observado”. Los cambios aplican a los ciclos que se lancen después.</p>
        </div>
        <div className="flex gap-2">
          {biblioteca.length === 0 && <button type="button" onClick={() => ejecutar(cargarBibliotecaBase)} className="px-4 py-2 text-xs font-bold text-white bg-marca-900 rounded-xl">Cargar biblioteca base</button>}
          <button type="button" onClick={() => setEdicion({ nombre: '', descripcion: '', grupo: 'corporativa', activa: true, conductas: ['', '', ''] })}
            className="px-4 py-2 text-xs font-bold text-acento-700 bg-acento-50 hover:bg-acento-100 rounded-xl">+ Competencia</button>
        </div>
      </div>

      {edicion && <FormularioCompetencia inicial={edicion} onCancelar={() => setEdicion(null)} onGuardar={d => ejecutar(() => guardarCompetencia(d))} />}

      {grupos.map(g => {
        const lista = biblioteca.filter(c => c.grupo === g.grupo);
        return (
          <div key={g.grupo}>
            <p className="text-[10px] font-black uppercase tracking-wider text-marca-400 mb-2">{g.titulo} · <span className="normal-case font-normal">{g.ayuda}</span></p>
            {lista.length === 0 ? <p className="text-xs text-slate-400 mb-2">Sin competencias.</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lista.map(c => (
                  <div key={c.id} className={`border rounded-2xl p-4 ${c.activa ? 'border-marca-100' : 'border-dashed border-slate-200 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-marca-900 text-sm">{c.nombre}{!c.activa && <span className="ml-1 text-[10px] text-slate-400">(inactiva)</span>}</p>
                        {c.descripcion && <p className="text-[11px] text-slate-500">{c.descripcion}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => setEdicion({ id: c.id, nombre: c.nombre, descripcion: c.descripcion, grupo: c.grupo, activa: c.activa, conductas: c.conductas.map(x => x.texto) })}
                          className="text-[11px] font-bold text-marca-600 hover:text-marca-900 px-1.5">Editar</button>
                        <button type="button" onClick={() => confirm(`¿Eliminar "${c.nombre}"? Los ciclos ya lanzados la conservan.`) && ejecutar(() => eliminarCompetencia(c.id))}
                          className="text-[11px] font-bold text-red-500 hover:text-red-700 px-1.5">Eliminar</button>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1">{c.conductas.map(x => <li key={x.id} className="text-[11px] text-slate-600">• {x.texto}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormularioCompetencia({ inicial, onCancelar, onGuardar }: { inicial: DatosCompetencia; onCancelar: () => void; onGuardar: (d: DatosCompetencia) => void }) {
  const [d, setD] = useState(inicial);
  const conducta = (i: number, v: string) => setD(p => ({ ...p, conductas: p.conductas.map((c, j) => (j === i ? v : c)) }));
  return (
    <div className="border border-acento-200 bg-acento-50/40 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="md:col-span-2"><span className={labelCls}>Competencia</span><input className={inputCls} value={d.nombre} onChange={e => setD({ ...d, nombre: e.target.value })} /></label>
        <label><span className={labelCls}>Aplica a</span>
          <select className={inputCls} value={d.grupo} onChange={e => setD({ ...d, grupo: e.target.value as GrupoCompetencia })}>
            <option value="corporativa">Todos (corporativa)</option><option value="liderazgo">Líderes (liderazgo)</option>
          </select>
        </label>
        <label className="md:col-span-3"><span className={labelCls}>Descripción</span><input className={inputCls} value={d.descripcion ?? ''} onChange={e => setD({ ...d, descripcion: e.target.value })} /></label>
      </div>
      <div>
        <span className={labelCls}>Conductas observables (1 a 6) — escribe lo que se ve, no rasgos de personalidad</span>
        <div className="space-y-2">
          {d.conductas.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={c} onChange={e => conducta(i, e.target.value)} placeholder="Ej.: Cumple sus compromisos en los plazos acordados." />
              <button type="button" onClick={() => setD(p => ({ ...p, conductas: p.conductas.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600 px-2" aria-label="Quitar conducta">✕</button>
            </div>
          ))}
        </div>
        {d.conductas.length < 6 && <button type="button" onClick={() => setD(p => ({ ...p, conductas: [...p.conductas, ''] }))} className="mt-2 text-[11px] font-bold text-acento-700">+ Conducta</button>}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={d.activa} onChange={e => setD({ ...d, activa: e.target.checked })} /> Activa (se incluye en los próximos ciclos)</label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button>
        <button type="button" onClick={() => onGuardar(d)} className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">Guardar</button>
      </div>
    </div>
  );
}

function PanelPulso({ datos, ejecutar }: { datos: RespuestaEv360; ejecutar: (f: () => Promise<unknown>) => void }) {
  const ciclo = datos.ciclo!;
  const [cierre, setCierre] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); });
  const p = datos.pulso;
  return (
    <div className="bg-white rounded-3xl border border-acento-200 p-5 flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-2xl">
        <h3 className="font-extrabold text-marca-900">📈 Pulso de seguimiento (mitad de ciclo)</h3>
        <p className="text-xs text-slate-500">
          Micro-evaluación de 1 a 3 preguntas: los mismos evaluadores de la 360 califican solo las competencias del plan de desarrollo de cada persona.
          Mide si hay avance antes del próximo corte. Se recomienda lanzarlo a mitad del período, cuando los planes ya tengan unas semanas.
        </p>
        {p && <p className="text-xs font-bold text-marca-700 mt-2">{p.estado === 'abierto' ? '🟢 Abierto' : '⚪ Cerrado'} · {p.completadas} de {p.asignadas} respuestas{p.cierra_el && ` · cierra el ${p.cierra_el}`}</p>}
      </div>
      {p ? (
        p.estado === 'abierto' && <button type="button" onClick={() => confirm('¿Cerrar el pulso? Ya no se recibirán respuestas.') && ejecutar(() => cerrarPulso(ciclo.id))}
          className="px-4 py-2 text-xs font-bold text-marca-700 bg-marca-50 hover:bg-marca-100 rounded-xl">Cerrar pulso</button>
      ) : (
        <div className="flex items-end gap-2">
          <label className="text-[10px] font-black uppercase text-slate-400">Cierra el
            <input type="date" value={cierre} onChange={e => setCierre(e.target.value)} className="block mt-1 text-sm bg-slate-50 border border-slate-200 rounded-xl p-2" />
          </label>
          <button type="button" onClick={() => confirm('Se enviará el pulso a los evaluadores de quienes tienen objetivos de desarrollo ligados a competencias de este ciclo. ¿Lanzar?') && ejecutar(() => lanzarPulso(ciclo.id, cierre || null))}
            className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">Lanzar pulso</button>
        </div>
      )}
    </div>
  );
}
