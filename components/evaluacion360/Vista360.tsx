'use client'
// Evaluación 360 por ciclos. Pestañas según el rol y la fase del ciclo:
//  Mis evaluaciones (todos) · Mi equipo: pares y avance (líder directo / Admin) · Resultados · Administrar (Admin) · Histórico.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Area } from '@/lib/tipos'
import {
  FASES, PARES_RECOMENDADOS, RELACIONES, cuestionarioPara, diasHasta, formatoPuntaje, indiceFase, limiteDeFase,
} from '@/lib/evaluacion360'
import { agregarPar, cargarEv360, excluirParticipante, quitarPar, type RespuestaEv360 } from '@/lib/evaluacion360Api'
import { mensajeDeError } from '@/lib/errores'
import { FormularioEvaluacion } from './FormularioEvaluacion'
import { InformeIndividual } from './InformeIndividual'
import { Administrar360 } from './Administrar360'
import { Desarrollo } from './Desarrollo'
import { FormularioPulso } from './FormularioPulso'

interface Props {
  areas: Area[];
  /** Evaluaciones del modelo anterior (se conservan como histórico) */
  historico?: ReactNode;
  onCambio?: () => void;
}

type Pestana = 'mias' | 'equipo' | 'resultados' | 'desarrollo' | 'admin' | 'historico';

export function Vista360({ areas, historico, onCambio }: Props) {
  const [cicloId, setCicloId] = useState<number | null>(null);
  const [datos, setDatos] = useState<RespuestaEv360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const [respondiendo, setRespondiendo] = useState<number | null>(null);
  const [informe, setInforme] = useState<number | null>(null);
  const [pulsoAbierto, setPulsoAbierto] = useState<number | null>(null);
  const [planDe, setPlanDe] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarEv360(cicloId)
      .then(r => { if (vigente) { setDatos(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [cicloId, version]);

  const recargar = (id?: number) => { if (id !== undefined) setCicloId(id); setVersion(v => v + 1); onCambio?.(); };

  const ciclo = datos?.ciclo ?? null;
  const pestanas = useMemo(() => {
    const p: { id: Pestana; titulo: string; aviso?: number }[] = [];
    if (!datos) return p;
    if (datos.permisos.miId !== null) p.push({ id: 'mias', titulo: 'Mis evaluaciones', aviso: (ciclo?.estado === 'evaluacion' ? datos.mias.filter(m => m.estado === 'pendiente').length : 0) + datos.misPulsos.filter(m => m.estado === 'pendiente').length });
    if (datos.nominacion.length || datos.avance) p.push({ id: 'equipo', titulo: datos.permisos.admin || datos.permisos.auditor ? 'Pares y avance' : 'Mi equipo' });
    if (datos.informes.length) p.push({ id: 'resultados', titulo: 'Resultados' });
    if (datos.permisos.miId !== null || datos.permisos.admin || datos.permisos.auditor) p.push({ id: 'desarrollo', titulo: '🌱 Desarrollo' });
    if (datos.permisos.admin) p.push({ id: 'admin', titulo: '⚙️ Administrar' });
    if (historico) p.push({ id: 'historico', titulo: 'Histórico' });
    return p;
  }, [datos, ciclo, historico]);
  const activa: Pestana | null = pestanas.find(p => p.id === pestana)?.id ?? pestanas[0]?.id ?? null;

  const limite = ciclo ? limiteDeFase(ciclo) : null;
  const dias = limite ? diasHasta(limite) : null;
  const respondiendoAsig = datos?.mias.find(m => m.id === respondiendo);
  const pulsoAsig = datos?.misPulsos.find(m => m.id === pulsoAbierto);

  return (
    <div className="space-y-6 animate-in fade-in w-full">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-marca-900">🔄 Evaluación 360°</h2>
          <p className="text-sm text-slate-500">Cómo te ven tu líder, tus pares y tu equipo, para crecer con foco. Sé concreto y constructivo.</p>
        </div>
        {datos && datos.ciclos.length > 0 && (
          <select className="text-xs font-bold bg-white border border-marca-100 rounded-xl px-3 py-2 text-marca-900" aria-label="Ciclo"
            value={ciclo?.id ?? ''} onChange={e => { setCicloId(Number(e.target.value)); setInforme(null); }}>
            {datos.ciclos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.estado === 'borrador' ? ' (borrador)' : c.estado === 'cerrado' ? ' (cerrado)' : ''}</option>)}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p>}
      {!datos && !error && <p className="text-sm text-slate-400">Cargando…</p>}

      {/* Fases del ciclo */}
      {ciclo && (
        <div className="bg-white rounded-3xl border border-marca-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="font-extrabold text-marca-900">{ciclo.nombre} <span className="text-xs font-normal text-slate-500">· período {ciclo.periodo_desde} → {ciclo.periodo_hasta}</span></p>
            {limite && dias !== null && (
              <span className={`text-[11px] font-bold rounded-full px-3 py-1 border ${dias < 0 ? 'bg-red-50 border-red-200 text-red-700' : dias <= 3 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-marca-50 border-marca-100 text-marca-700'}`}>
                ⏰ {dias < 0 ? `Fase vencida hace ${-dias} día(s)` : dias === 0 ? 'La fase vence hoy' : `Quedan ${dias} día(s) (hasta ${limite})`}
              </span>
            )}
          </div>
          <ol className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {FASES.map((f, i) => {
              const actual = indiceFase(ciclo.estado);
              const estado = i < actual ? 'hecha' : i === actual ? 'actual' : 'futura';
              return (
                <li key={f.estado} title={f.descripcion}
                  className={`rounded-xl px-3 py-2 border text-[11px] ${estado === 'actual' ? 'bg-acento-50 border-acento-300 text-acento-900' : estado === 'hecha' ? 'bg-marca-50 border-marca-100 text-marca-600' : 'bg-white border-slate-100 text-slate-400'}`}>
                  <span className="font-black">{estado === 'hecha' ? '✓' : i + 1}. {f.titulo}</span>
                  {estado === 'actual' && <span className="block mt-0.5 leading-snug">{f.descripcion}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {datos && !ciclo && !datos.permisos.admin && (
        <div className="bg-white border border-dashed border-marca-200 rounded-3xl p-8 text-center">
          <p className="text-4xl">🔄</p>
          <p className="font-bold text-marca-900 mt-2">Aún no hay un ciclo de evaluación 360 activo.</p>
          <p className="text-sm text-slate-500 mt-1">Cuando el Admin lance uno, aquí verás tus evaluaciones pendientes.</p>
        </div>
      )}

      {/* Pestañas */}
      {pestanas.length > 1 && (
        <div className="flex flex-wrap gap-1 bg-marca-50 p-1 rounded-xl w-fit" role="tablist">
          {pestanas.map(p => (
            <button key={p.id} type="button" role="tab" aria-selected={activa === p.id} onClick={() => { setPestana(p.id); setInforme(null); setPlanDe(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold ${activa === p.id ? 'bg-white text-marca-900 shadow-sm' : 'text-marca-500 hover:text-marca-900'}`}>
              {p.titulo}{!!p.aviso && <span className="ml-1.5 bg-acento-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">{p.aviso}</span>}
            </button>
          ))}
        </div>
      )}

      {datos && activa === 'mias' && <MisEvaluaciones datos={datos} onResponder={setRespondiendo} onPulso={setPulsoAbierto} />}
      {datos && activa === 'equipo' && <Equipo datos={datos} areas={areas} onCambio={() => recargar()} />}
      {datos && activa === 'resultados' && (informe
        ? <InformeIndividual participanteId={informe} onVolver={() => setInforme(null)} onCambio={() => recargar()}
            onIrAlPlan={id => { setPlanDe(id); setInforme(null); setPestana('desarrollo'); }} />
        : <ListaInformes datos={datos} onAbrir={setInforme} />)}
      {activa === 'desarrollo' && <Desarrollo seleccion={planDe} onSeleccion={setPlanDe} />}
      {datos && activa === 'admin' && <Administrar360 datos={datos} onCambio={recargar} />}
      {activa === 'historico' && historico}

      {respondiendoAsig && ciclo && (
        <FormularioEvaluacion asignacionId={respondiendoAsig.id} evaluado={respondiendoAsig.evaluado} relacion={respondiendoAsig.relacion}
          items={cuestionarioPara(ciclo.cuestionario, respondiendoAsig.es_lider)} minimoAnonimato={ciclo.minimo_anonimato}
          onCerrar={() => setRespondiendo(null)} onEnviada={() => { setRespondiendo(null); recargar(); }} />
      )}
      {pulsoAsig && (
        <FormularioPulso asignacionId={pulsoAsig.id} evaluado={pulsoAsig.evaluado} relacion={pulsoAsig.relacion} competencias={pulsoAsig.competencias}
          onCerrar={() => setPulsoAbierto(null)} onEnviado={() => { setPulsoAbierto(null); recargar(); }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------

function MisEvaluaciones({ datos, onResponder, onPulso }: { datos: RespuestaEv360; onResponder: (id: number) => void; onPulso: (id: number) => void }) {
  const ciclo = datos.ciclo;
  if (!ciclo || ciclo.estado === 'borrador') return <p className="text-sm text-slate-400">No hay evaluaciones para responder.</p>;
  const pulsosPendientes = datos.misPulsos.filter(m => m.estado === 'pendiente');
  const abierta = ciclo.estado === 'evaluacion';
  const hechas = datos.mias.filter(m => m.estado === 'completada').length;
  const icono = { auto: '🪞', lider: '🧭', par: '🤝', colaborador: '⬆️' } as const;
  return (
    <div className="space-y-4">
      {datos.misPulsos.length > 0 && (
        <div className="bg-gradient-to-r from-acento-50 to-white border border-acento-200 rounded-3xl p-5">
          <p className="font-extrabold text-marca-900 text-sm">📈 Pulso de seguimiento{datos.pulso?.cierra_el && <span className="font-normal text-xs text-slate-500"> · hasta el {datos.pulso.cierra_el}</span>}</p>
          <p className="text-[11px] text-slate-600 mb-3">Pocas preguntas sobre los focos del plan de desarrollo de cada persona: ¿se nota el avance desde la última evaluación?</p>
          <div className="flex flex-wrap gap-2">
            {datos.misPulsos.map(m => m.estado === 'completada'
              ? <span key={m.id} className="text-xs font-bold text-acento-700 bg-white border border-acento-200 rounded-xl px-3 py-2">✅ {m.relacion === 'auto' ? 'Mi avance' : m.evaluado.nombre}</span>
              : <button key={m.id} type="button" onClick={() => onPulso(m.id)} className="text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl px-3 py-2">{m.relacion === 'auto' ? 'Mi avance' : m.evaluado.nombre} · {m.competencias.length} pregunta(s)</button>)}
          </div>
          {pulsosPendientes.length === 0 && <p className="text-[11px] text-acento-700 font-bold mt-2">¡Gracias! Respondiste todos tus pulsos.</p>}
        </div>
      )}
      {ciclo.estado === 'nominacion' && <p className="text-sm bg-marca-50 border border-marca-100 text-marca-800 rounded-2xl p-4">Los líderes están eligiendo a los pares. La evaluación se abrirá pronto{ciclo.nominacion_hasta && ` (después del ${ciclo.nominacion_hasta})`}.</p>}
      {indiceFase(ciclo.estado) > indiceFase('evaluacion') && datos.misPulsos.length === 0 && <p className="text-sm bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl p-4">La ventana de evaluación ya cerró.</p>}
      {datos.mias.length > 0 && <p className="text-xs font-bold text-marca-700">{hechas} de {datos.mias.length} completadas</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {datos.mias.map(m => (
          <div key={m.id} className={`bg-white rounded-2xl border p-5 flex flex-col ${m.estado === 'completada' ? 'border-acento-200' : 'border-marca-100 shadow-sm'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-acento-700">{icono[m.relacion]} {m.relacion === 'colaborador' ? 'A mi líder' : m.relacion === 'lider' ? 'A mi colaborador' : RELACIONES[m.relacion]}</p>
            <p className="font-extrabold text-marca-900 mt-1">{m.relacion === 'auto' ? 'Mi autoevaluación' : m.evaluado.nombre}</p>
            <p className="text-xs text-slate-500 flex-1">{m.relacion === 'auto' ? 'Cómo me veo este período' : m.evaluado.puesto}</p>
            {m.estado === 'completada'
              ? <p className="mt-3 text-xs font-bold text-acento-700">✅ Enviada</p>
              : <button type="button" disabled={!abierta} onClick={() => onResponder(m.id)}
                  className="mt-3 px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 disabled:bg-slate-300 rounded-xl">
                  {abierta ? 'Responder' : 'Aún no disponible'}
                </button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Equipo({ datos, areas, onCambio }: { datos: RespuestaEv360; areas: Area[]; onCambio: () => void }) {
  const [filtro, setFiltro] = useState('');
  const ciclo = datos.ciclo!;
  const editable = ciclo.estado === 'nominacion' || ciclo.estado === 'evaluacion';
  const nombreArea = (id: number | null) => areas.find(a => a.id === id)?.nombre ?? 'Sin área';
  const q = filtro.trim().toLowerCase();
  const lista = datos.nominacion.filter(n => !q || n.evaluado.nombre.toLowerCase().includes(q) || nombreArea(n.evaluado.area_id).toLowerCase().includes(q));
  const pctAvance = datos.avance && datos.avance.total ? Math.round((datos.avance.completadas / datos.avance.total) * 100) : null;

  async function ejecutar(f: () => Promise<unknown>) {
    try { await f(); onCambio(); } catch (e) { alert(mensajeDeError(e)); }
  }

  return (
    <div className="space-y-6">
      {datos.avance && (
        <div className="bg-white rounded-3xl border border-marca-100 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-marca-900 text-sm">Avance de respuestas</h3>
            <span className="font-titulo text-2xl font-extrabold text-acento-700">{pctAvance ?? 0}%</span>
          </div>
          <p className="text-[11px] text-slate-500">{datos.avance.completadas} de {datos.avance.total} evaluaciones enviadas.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="space-y-2">
              {datos.avance.porArea.map(a => (
                <div key={a.area} className="flex items-center gap-3 text-xs">
                  <span className="w-40 truncate text-slate-600 font-bold" title={a.area}>{a.area}</span>
                  <div className="flex-1 h-2.5 bg-marca-50 rounded-full overflow-hidden"><div className="h-full bg-acento-500" style={{ width: `${(a.completadas / a.total) * 100}%` }} /></div>
                  <span className="w-14 text-right text-slate-500">{a.completadas}/{a.total}</span>
                </div>
              ))}
            </div>
            {datos.avance.rezagados.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Con más evaluaciones pendientes</p>
                <ul className="text-xs space-y-1">{datos.avance.rezagados.map(r => <li key={r.persona.id} className="flex justify-between"><span className="text-marca-900">{r.persona.nombre}</span><span className="font-bold text-amber-700">{r.pendientes}</span></li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-extrabold text-marca-900 text-sm">Evaluadores de {datos.permisos.admin ? 'cada persona' : 'mi equipo'}</h3>
            <p className="text-[11px] text-slate-500">
              El líder y los colaboradores se asignan solos. Elige {PARES_RECOMENDADOS.min}–{PARES_RECOMENDADOS.max} pares que trabajen de cerca con la persona
              (para que sus respuestas sean anónimas se necesitan al menos {ciclo.minimo_anonimato}).
            </p>
          </div>
          {datos.nominacion.length > 6 && <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por nombre o área…" className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-56" />}
        </div>
        <div className="divide-y divide-slate-100">
          {lista.map(n => {
            const pares = n.evaluadores.filter(e => e.relacion === 'par');
            const ocupados = new Set([n.evaluado.id, ...n.evaluadores.map(e => e.evaluador.id)]);
            const candidatos = [...datos.candidatos.filter(c => !ocupados.has(c.id))]
              .sort((a, b) => Number(b.area_id === n.evaluado.area_id) - Number(a.area_id === n.evaluado.area_id) || a.nombre.localeCompare(b.nombre, 'es'));
            return (
              <div key={n.participante_id} className="py-4 flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="lg:w-60 shrink-0">
                  <p className="font-bold text-marca-900 text-sm">{n.evaluado.nombre}</p>
                  <p className="text-[11px] text-slate-500">{n.evaluado.puesto} · {nombreArea(n.evaluado.area_id)}</p>
                  {pares.length < PARES_RECOMENDADOS.min && editable && <p className="text-[10px] font-bold text-amber-700 mt-1">⚠️ Faltan pares ({pares.length}/{PARES_RECOMENDADOS.min})</p>}
                  {datos.permisos.admin && ciclo.estado === 'nominacion' && (
                    <button type="button" onClick={() => confirm(`¿Excluir a ${n.evaluado.nombre} de este ciclo? (p. ej. ingreso reciente o licencia)`) && ejecutar(() => excluirParticipante(n.participante_id))}
                      className="text-[10px] font-bold text-slate-400 hover:text-red-600 mt-1">Excluir del ciclo</button>
                  )}
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-1.5">
                  {n.evaluadores.map(e => (
                    <span key={e.asignacion_id} className={`text-[11px] rounded-full pl-2.5 pr-1.5 py-1 border flex items-center gap-1 ${e.relacion === 'par' ? 'bg-acento-50 border-acento-200 text-acento-900' : 'bg-marca-50 border-marca-100 text-marca-800'}`}>
                      <span className="font-bold">{e.evaluador.nombre}</span>
                      <span className="text-[9px] uppercase opacity-70">{RELACIONES[e.relacion]}</span>
                      <span title={e.estado === 'completada' ? 'Respondió' : 'Pendiente'}>{e.estado === 'completada' ? '✅' : '⏳'}</span>
                      {editable && e.relacion === 'par' && e.estado === 'pendiente' && (
                        <button type="button" onClick={() => ejecutar(() => quitarPar(e.asignacion_id))} className="text-slate-400 hover:text-red-600 px-0.5" aria-label={`Quitar a ${e.evaluador.nombre}`}>✕</button>
                      )}
                    </span>
                  ))}
                  {n.evaluadores.length === 0 && <span className="text-[11px] text-slate-400">Solo autoevaluación.</span>}
                  {editable && (
                    <select value="" aria-label={`Agregar par para ${n.evaluado.nombre}`} onChange={e => e.target.value && ejecutar(() => agregarPar(n.participante_id, Number(e.target.value)))}
                      className="text-[11px] font-bold bg-white border border-dashed border-acento-300 text-acento-700 rounded-full px-2 py-1 max-w-52">
                      <option value="">+ Agregar par</option>
                      {candidatos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.area_id === n.evaluado.area_id ? ' (misma área)' : ''}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ListaInformes({ datos, onAbrir }: { datos: RespuestaEv360; onAbrir: (id: number) => void }) {
  const miId = datos.permisos.miId;
  const propio = datos.informes.find(i => i.evaluado.id === miId);
  const otros = datos.informes.filter(i => i.evaluado.id !== miId);
  const ciclo = datos.ciclo!;
  return (
    <div className="space-y-6">
      {propio && (
        <button type="button" onClick={() => onAbrir(propio.participante_id)}
          className="w-full text-left bg-gradient-to-r from-marca-900 to-marca-700 text-white rounded-3xl p-6 flex items-center justify-between gap-4 hover:shadow-lg transition-shadow">
          <span><span className="text-[10px] font-black uppercase tracking-wider text-acento-300">Ya está disponible</span><span className="block text-xl font-extrabold">Mi informe 360</span><span className="text-xs text-marca-200">Conversado con tu líder · ábrelo para ver el detalle y dejar tu reflexión</span></span>
          <span className="font-titulo text-4xl font-extrabold text-acento-300">{formatoPuntaje(propio.global)}</span>
        </button>
      )}
      {otros.length > 0 && (
        <div className="bg-white rounded-3xl border border-marca-100 p-5 overflow-x-auto">
          <h3 className="font-extrabold text-marca-900 text-sm mb-1">{datos.permisos.admin || datos.permisos.auditor ? 'Informes de la empresa' : 'Informes de mi equipo'}</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            {ciclo.estado === 'calibracion' ? 'Revisa los resultados antes de la entrega. Las personas aún no ven sus informes.' : 'Cada persona verá su informe cuando su líder registre la conversación 1:1.'}
          </p>
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase text-slate-400 text-left"><th className="pb-2 font-black">Persona</th><th className="pb-2 font-black text-right">Resultado</th><th className="pb-2 font-black text-right">Respuestas</th><th className="pb-2 font-black pl-4">Entrega</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {otros.map(i => (
                <tr key={i.participante_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onAbrir(i.participante_id)}>
                  <td className="py-2"><span className="font-bold text-marca-900">{i.evaluado.nombre}</span><span className="block text-[10px] text-slate-400">{i.evaluado.puesto}</span></td>
                  <td className="text-right font-extrabold text-marca-900">{formatoPuntaje(i.global)}{i.calibrado && <span className="ml-1" title="Con ajustes de calibración">⚖️</span>}</td>
                  <td className="text-right text-slate-500">{i.respuestas}</td>
                  <td className="pl-4">{i.conversado_en ? <span className="text-acento-700 font-bold">✅ Conversado</span> : <span className="text-slate-400">Pendiente</span>}</td>
                  <td className="text-right text-acento-700 font-bold">Ver →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
