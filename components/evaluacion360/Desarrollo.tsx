'use client'
// Desarrollo después de la 360: lista de planes (yo + mi equipo) y el plan de desarrollo individual (PDI 70-20-10)
// con su seguimiento mensual (check-ins).
import { useEffect, useState } from 'react'
import {
  ESTADOS_OBJETIVO, MAX_OBJETIVOS_ACTIVOS, TIPOS_ACCION, avanceObjetivo, consejoMezcla, esActivo, estadoCheckin, mezcla, validarObjetivo,
  type EstadoObjetivo, type ObjetivoPDI, type TipoAccion,
} from '@/lib/desarrollo'
import {
  cargarPlan, cargarResumenDesarrollo, eliminarAccionPDI, eliminarObjetivoPDI, estadoObjetivoPDI, guardarAccionPDI, guardarObjetivoPDI,
  marcarAccionPDI, registrarCheckin, type DatosObjetivoPDI, type PlanPersona, type ResumenDesarrollo,
} from '@/lib/desarrolloApi'
import { etiquetaMes } from '@/lib/periodos'
import { formatoPuntaje } from '@/lib/evaluacion360'
import { mensajeDeError } from '@/lib/errores'

const inputCls = 'w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-acento-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

const ESTADO_CHECKIN = {
  al_dia: { texto: 'Check-in al día', cls: 'bg-acento-50 text-acento-800 border-acento-200' },
  pendiente: { texto: 'Check-in del mes pendiente', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  atrasado: { texto: 'Sin check-in reciente', cls: 'bg-red-50 text-red-700 border-red-200' },
} as const;

export function Desarrollo({ seleccion, onSeleccion }: { seleccion: number | null; onSeleccion: (id: number | null) => void }) {
  const [resumen, setResumen] = useState<ResumenDesarrollo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    cargarResumenDesarrollo()
      .then(r => { if (vigente) { setResumen(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [version]);

  if (error) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p>;
  if (!resumen) return <p className="text-sm text-slate-400">Cargando…</p>;

  const soloYo = resumen.personas.length === 1 && resumen.personas[0].propio;
  const elegido = seleccion ?? (soloYo ? resumen.personas[0].persona.id : null);
  if (elegido !== null) {
    return <PlanDesarrollo key={elegido} empleadoId={elegido} onVolver={soloYo ? undefined : () => onSeleccion(null)} onCambio={() => setVersion(v => v + 1)} />;
  }

  const equipo = resumen.personas.filter(p => !p.propio);
  const yo = resumen.personas.find(p => p.propio);
  const pendientes = equipo.filter(p => p.editable && p.estadoCheckin && p.estadoCheckin !== 'al_dia').length;
  const sinPlan = equipo.filter(p => p.editable && p.objetivos === 0).length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-marca-900 to-marca-700 text-white rounded-3xl p-6">
        <p className="text-[10px] font-black uppercase tracking-wider text-acento-300">Del feedback a la acción</p>
        <h3 className="text-xl font-extrabold">Planes de desarrollo 70-20-10</h3>
        <p className="text-xs text-marca-200 mt-1 max-w-2xl">1–3 objetivos ligados a una competencia del informe 360. Cerca del 70% de las acciones son de experiencia (aprender haciendo), 20% de relaciones (mentoría, feedback) y 10% de formación. El líder y la persona conversan el avance cada mes.</p>
        {(pendientes > 0 || sinPlan > 0) && (
          <p className="mt-3 text-xs font-bold text-amber-200">{pendientes > 0 && `⏰ ${pendientes} check-in(s) pendientes este mes`}{pendientes > 0 && sinPlan > 0 && ' · '}{sinPlan > 0 && `📝 ${sinPlan} persona(s) de tu equipo directo sin plan`}</p>
        )}
      </div>

      {yo && <FilaPersona p={yo} mes={resumen.mesActual} onAbrir={() => onSeleccion(yo.persona.id)} titulo="Mi plan de desarrollo" />}

      {equipo.length > 0 && (
        <div className="bg-white rounded-3xl border border-marca-100 p-5">
          <h3 className="font-extrabold text-marca-900 text-sm mb-3">Planes de {resumen.personas.some(p => !p.propio && !p.editable) ? 'mi equipo y la organización' : 'mi equipo'}</h3>
          <div className="divide-y divide-slate-100">
            {equipo.map(p => <FilaPersona key={p.persona.id} p={p} mes={resumen.mesActual} onAbrir={() => onSeleccion(p.persona.id)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaPersona({ p, mes, onAbrir, titulo }: { p: ResumenDesarrollo['personas'][number]; mes: string; onAbrir: () => void; titulo?: string }) {
  const tarjeta = !!titulo;
  return (
    <button type="button" onClick={onAbrir}
      className={`w-full text-left flex flex-wrap items-center justify-between gap-3 ${tarjeta ? 'bg-white border border-marca-100 rounded-3xl p-5 hover:shadow-md' : 'py-3 hover:bg-slate-50 px-2 rounded-xl'}`}>
      <span>
        <span className={`block font-bold text-marca-900 ${tarjeta ? 'text-base' : 'text-sm'}`}>{titulo ?? p.persona.nombre}</span>
        <span className="text-[11px] text-slate-500">{tarjeta ? 'Objetivos, acciones y seguimiento mensual' : p.persona.puesto}{!p.editable && !p.propio && ' · solo lectura'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {p.objetivos === 0
          ? <span className="text-[11px] font-bold text-slate-400">Sin objetivos en curso{p.logrados ? ` · ${p.logrados} logrado(s)` : ''}</span>
          : <span className="text-[11px] font-bold text-marca-700">{p.objetivos} objetivo(s) · {p.avance}% de avance</span>}
        {p.estadoCheckin && <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${ESTADO_CHECKIN[p.estadoCheckin].cls}`} title={p.ultimoCheckin ? `Último: ${etiquetaMes(p.ultimoCheckin)}` : undefined}>{p.estadoCheckin === 'al_dia' ? `✅ ${etiquetaMes(mes)}` : ESTADO_CHECKIN[p.estadoCheckin].texto}</span>}
        <span className="text-acento-700 font-bold text-xs">Abrir →</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ Plan de una persona

export function PlanDesarrollo({ empleadoId, onVolver, onCambio }: { empleadoId: number; onVolver?: () => void; onCambio?: () => void }) {
  const [plan, setPlan] = useState<PlanPersona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editando, setEditando] = useState<DatosObjetivoPDI | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vigente = true;
    cargarPlan(empleadoId)
      .then(r => { if (vigente) { setPlan(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [empleadoId, version]);

  async function ejecutar(f: () => Promise<unknown>) {
    try { await f(); setVersion(v => v + 1); onCambio?.(); return true; } catch (e) { alert(mensajeDeError(e)); return false; }
  }

  const volver = onVolver && <button type="button" onClick={onVolver} className="text-xs font-bold text-marca-600 hover:text-marca-900">← Volver a la lista</button>;
  if (error) return <div className="space-y-4">{volver}<p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p></div>;
  if (!plan) return <div className="space-y-4">{volver}<p className="text-sm text-slate-400">Cargando plan…</p></div>;

  const activos = plan.objetivos.filter(esActivo);
  const cerrados = plan.objetivos.filter(o => !esActivo(o));
  const puedeAgregar = plan.permisos.editar && activos.length < MAX_OBJETIVOS_ACTIVOS;
  const todasAcciones = activos.flatMap(o => o.acciones);
  const reparto = mezcla(todasAcciones);
  const consejo = consejoMezcla(todasAcciones);
  const nombre = plan.persona.nombre.split(' ')[0];
  const nuevo = (competencia?: { id: number; nombre: string }) => setEditando({
    empleado_id: empleadoId, titulo: '', resultado_esperado: '', fecha_limite: null,
    ciclo_id: competencia ? plan.sugerencias!.ciclo.id : null, competencia_id: competencia?.id ?? null, competencia: competencia?.nombre ?? null,
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {volver}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-acento-700">Plan de desarrollo individual</p>
          <h3 className="text-2xl font-extrabold text-marca-900">{plan.permisos.propio ? 'Mi plan' : plan.persona.nombre}</h3>
          <p className="text-sm text-slate-500">{plan.persona.puesto}{!plan.permisos.editar && ' · solo lectura'}</p>
        </div>
        {puedeAgregar && <button type="button" onClick={() => nuevo()} className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">+ Objetivo de desarrollo</button>}
      </div>

      {/* Sugerencias desde la 360 */}
      {plan.sugerencias && plan.permisos.editar && activos.length < MAX_OBJETIVOS_ACTIVOS && (
        <div className="bg-acento-50/60 border border-acento-200 rounded-3xl p-5">
          <p className="font-extrabold text-marca-900 text-sm">💡 Focos sugeridos por la {plan.sugerencias.ciclo.nombre}</p>
          <p className="text-[11px] text-slate-600 mb-3">Elige una competencia para crear el objetivo ligado a ella (el pulso de seguimiento medirá su avance).</p>
          <div className="flex flex-wrap gap-2">
            {plan.sugerencias.competencias.filter(c => c.sugerida && !activos.some(o => o.competencia_id === c.id)).map(c => (
              <button key={c.id} type="button" onClick={() => nuevo(c)} className="text-left bg-white border border-acento-200 hover:border-acento-500 rounded-2xl px-3 py-2">
                <span className="block text-xs font-bold text-marca-900">{c.nombre} · {formatoPuntaje(c.final)}</span>
                <span className="text-[10px] text-acento-700 font-bold">{c.motivo}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {editando && <FormularioObjetivo inicial={editando} plan={plan} onCancelar={() => setEditando(null)}
        onGuardar={async d => { if (await ejecutar(() => guardarObjetivoPDI(d))) setEditando(null); }} />}

      {activos.length === 0 && !editando && (
        <div className="bg-white border border-dashed border-marca-200 rounded-3xl p-8 text-center">
          <p className="text-4xl">🌱</p>
          <p className="font-bold text-marca-900 mt-2">{plan.permisos.propio ? 'Aún no tienes objetivos de desarrollo en curso.' : `${nombre} aún no tiene objetivos de desarrollo en curso.`}</p>
          <p className="text-sm text-slate-500 mt-1">Definan juntos 1 a 3 focos después de la conversación de resultados 360.</p>
        </div>
      )}

      {activos.length > 0 && (
        <div className="bg-white rounded-2xl border border-marca-100 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-bold text-marca-900">Mezcla de acciones</span>
          {(Object.keys(TIPOS_ACCION) as TipoAccion[]).map(t => (
            <span key={t} className="text-slate-600">{TIPOS_ACCION[t].icono} {TIPOS_ACCION[t].titulo}: <strong className="text-marca-900">{reparto[t]}%</strong> <span className="text-slate-400">(sugerido {TIPOS_ACCION[t].meta}%)</span></span>
          ))}
          {consejo && <span className="w-full text-[11px] text-amber-800">⚠️ {consejo}</span>}
        </div>
      )}

      {activos.map(o => <TarjetaObjetivo key={o.id} o={o} editable={plan.permisos.editar} ejecutar={ejecutar}
        onEditar={() => setEditando({ id: o.id, empleado_id: empleadoId, titulo: o.titulo, resultado_esperado: o.resultado_esperado ?? '', fecha_limite: o.fecha_limite, ciclo_id: o.ciclo_id, competencia_id: o.competencia_id, competencia: o.competencia })} />)}

      <Checkins plan={plan} ejecutar={ejecutar} />

      {cerrados.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerTodos(!verTodos)} className="text-xs font-bold text-marca-600 hover:text-marca-900">{verTodos ? '▾' : '▸'} Objetivos anteriores ({cerrados.length})</button>
          {verTodos && <div className="mt-3 space-y-3">{cerrados.map(o => <TarjetaObjetivo key={o.id} o={o} editable={plan.permisos.editar} ejecutar={ejecutar} />)}</div>}
        </div>
      )}
    </div>
  );
}

function FormularioObjetivo({ inicial, plan, onCancelar, onGuardar }: { inicial: DatosObjetivoPDI; plan: PlanPersona; onCancelar: () => void; onGuardar: (d: DatosObjetivoPDI) => void }) {
  const [d, setD] = useState(inicial);
  const competencias = plan.sugerencias?.competencias ?? [];
  return (
    <div className="bg-white border border-acento-200 rounded-3xl p-5 space-y-4">
      <h4 className="font-extrabold text-marca-900">{inicial.id ? 'Editar objetivo' : 'Nuevo objetivo de desarrollo'}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="md:col-span-2"><span className={labelCls}>¿Qué quieres desarrollar?</span>
          <input className={inputCls} value={d.titulo} onChange={e => setD({ ...d, titulo: e.target.value })} placeholder="Ej.: Dar feedback específico y frecuente a mi equipo" />
        </label>
        <label><span className={labelCls}>Competencia 360</span>
          <select className={inputCls} value={d.competencia_id ?? ''} disabled={competencias.length === 0}
            onChange={e => { const c = competencias.find(x => x.id === Number(e.target.value)); setD({ ...d, competencia_id: c?.id ?? null, competencia: c?.nombre ?? null, ciclo_id: c ? plan.sugerencias!.ciclo.id : null }); }}>
            <option value="">{competencias.length ? 'Sin competencia' : d.competencia ?? 'Sin informe 360 disponible'}</option>
            {competencias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({formatoPuntaje(c.final)})</option>)}
          </select>
        </label>
        <label className="md:col-span-2"><span className={labelCls}>¿Cómo se verá el cambio? (resultado observable)</span>
          <input className={inputCls} value={d.resultado_esperado} onChange={e => setD({ ...d, resultado_esperado: e.target.value })} placeholder="Ej.: Cada persona del equipo recibe feedback quincenal con ejemplos concretos" />
        </label>
        <label><span className={labelCls}>Fecha objetivo</span>
          <input type="date" className={inputCls} value={d.fecha_limite ?? ''} onChange={e => setD({ ...d, fecha_limite: e.target.value || null })} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button>
        <button type="button" onClick={() => { const err = validarObjetivo(d); if (err) alert(err); else onGuardar(d); }} className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">Guardar</button>
      </div>
    </div>
  );
}

function TarjetaObjetivo({ o, editable, ejecutar, onEditar }: { o: ObjetivoPDI; editable: boolean; ejecutar: (f: () => Promise<unknown>) => Promise<boolean>; onEditar?: () => void }) {
  const [nueva, setNueva] = useState<{ tipo: TipoAccion; descripcion: string; fecha_limite: string } | null>(null);
  const avance = avanceObjetivo(o);
  const activo = esActivo(o);
  const cambiarEstado = (estado: EstadoObjetivo) => ejecutar(() => estadoObjetivoPDI(o.id, estado));

  return (
    <div className={`bg-white rounded-3xl border ${activo ? 'border-marca-100 shadow-sm' : 'border-slate-100 opacity-80'} overflow-hidden`}>
      <div className="p-5 flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-marca-50 to-white">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {o.competencia && <span className="text-[10px] font-black uppercase tracking-wider bg-marca-900 text-white px-2.5 py-1 rounded-full">🎯 {o.competencia}</span>}
            <span className={`text-[10px] font-bold border px-2.5 py-1 rounded-full ${ESTADOS_OBJETIVO[o.estado].color}`}>{ESTADOS_OBJETIVO[o.estado].titulo}</span>
            {o.fecha_limite && <span className="text-[10px] font-bold text-slate-500 px-1 py-1">📅 {o.fecha_limite}</span>}
          </div>
          <h4 className="font-extrabold text-marca-900 mt-2">{o.titulo}</h4>
          {o.resultado_esperado && <p className="text-xs text-slate-500 mt-0.5">Resultado esperado: {o.resultado_esperado}</p>}
        </div>
        <div className="text-right">
          <span className="font-titulo text-2xl font-extrabold text-acento-700">{avance}%</span>
          <div className="w-28 h-1.5 bg-marca-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-acento-500" style={{ width: `${avance}%` }} /></div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(Object.keys(TIPOS_ACCION) as TipoAccion[]).map(t => {
          const acciones = o.acciones.filter(a => a.tipo === t);
          return (
            <div key={t} className="bg-slate-50/70 rounded-2xl p-3">
              <p className="text-[10px] font-black uppercase text-marca-500">{TIPOS_ACCION[t].icono} {TIPOS_ACCION[t].titulo} · {TIPOS_ACCION[t].meta}%</p>
              <p className="text-[10px] text-slate-400 mb-2">{TIPOS_ACCION[t].ayuda}</p>
              <ul className="space-y-1.5">
                {acciones.map(a => (
                  <li key={a.id} className="flex items-start gap-2 text-xs group">
                    <input type="checkbox" checked={a.completada} disabled={!editable || !activo} onChange={e => ejecutar(() => marcarAccionPDI(a.id, e.target.checked))} className="mt-0.5 accent-emerald-600" aria-label={a.descripcion} />
                    <span className={`flex-1 ${a.completada ? 'line-through text-slate-400' : 'text-slate-700'}`}>{a.descripcion}{a.fecha_limite && <span className="block text-[10px] text-slate-400">hasta {a.fecha_limite}</span>}</span>
                    {editable && activo && <button type="button" onClick={() => confirm('¿Eliminar esta acción?') && ejecutar(() => eliminarAccionPDI(a.id))} className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100" aria-label="Eliminar acción">✕</button>}
                  </li>
                ))}
                {acciones.length === 0 && <li className="text-[11px] text-slate-400">—</li>}
              </ul>
              {editable && activo && nueva?.tipo !== t && (
                <button type="button" onClick={() => setNueva({ tipo: t, descripcion: '', fecha_limite: '' })} className="mt-2 text-[11px] font-bold text-acento-700">+ Acción</button>
              )}
              {nueva?.tipo === t && (
                <div className="mt-2 space-y-1.5">
                  <input autoFocus className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2" value={nueva.descripcion} placeholder={TIPOS_ACCION[t].ejemplo}
                    onChange={e => setNueva({ ...nueva, descripcion: e.target.value })} />
                  <div className="flex gap-1.5">
                    <input type="date" className="flex-1 text-xs bg-white border border-slate-200 rounded-lg p-1.5" value={nueva.fecha_limite} onChange={e => setNueva({ ...nueva, fecha_limite: e.target.value })} aria-label="Fecha límite" />
                    <button type="button" onClick={async () => { if (await ejecutar(() => guardarAccionPDI({ objetivo_id: o.id, tipo: t, descripcion: nueva.descripcion, fecha_limite: nueva.fecha_limite || null }))) setNueva(null); }}
                      className="px-2.5 text-xs font-bold text-white bg-acento-600 rounded-lg">Agregar</button>
                    <button type="button" onClick={() => setNueva(null)} className="px-1.5 text-xs text-slate-400">✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="px-5 pb-4 flex flex-wrap gap-2 justify-end">
          {activo ? (
            <>
              {onEditar && <button type="button" onClick={onEditar} className="px-3 py-1.5 text-[11px] font-bold text-marca-700 bg-marca-50 rounded-lg">Editar</button>}
              <button type="button" onClick={() => cambiarEstado('logrado')} className="px-3 py-1.5 text-[11px] font-bold text-acento-800 bg-acento-50 rounded-lg">✓ Marcar logrado</button>
              <button type="button" onClick={() => cambiarEstado('no_logrado')} className="px-3 py-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg">No logrado</button>
              <button type="button" onClick={() => confirm('¿Eliminar el objetivo y sus acciones?') && ejecutar(() => eliminarObjetivoPDI(o.id))} className="px-3 py-1.5 text-[11px] font-bold text-red-600">Eliminar</button>
            </>
          ) : <button type="button" onClick={() => cambiarEstado('en_curso')} className="px-3 py-1.5 text-[11px] font-bold text-marca-700 bg-marca-50 rounded-lg">↩ Reabrir</button>}
        </div>
      )}
    </div>
  );
}

function Checkins({ plan, ejecutar }: { plan: PlanPersona; ejecutar: (f: () => Promise<unknown>) => Promise<boolean> }) {
  const delMes = plan.checkins.find(c => c.periodo === plan.mesActual);
  const [comentario, setComentario] = useState(delMes?.comentario ?? '');
  const [pasos, setPasos] = useState(delMes?.proximos_pasos ?? '');
  const estado = plan.objetivos.some(esActivo) ? estadoCheckin(plan.checkins[0]?.periodo ?? null) : null;
  return (
    <div className="bg-white rounded-3xl border border-marca-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-extrabold text-marca-900 text-sm">🗓️ Seguimiento mensual (check-in)</h4>
        {estado && <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${ESTADO_CHECKIN[estado].cls}`}>{ESTADO_CHECKIN[estado].texto}</span>}
      </div>
      <p className="text-[11px] text-slate-500 mb-4">Una conversación corta cada mes: ¿qué avanzó?, ¿qué lo frenó?, ¿qué apoyo necesita?, ¿qué sigue?</p>
      {plan.permisos.editar && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <label><span className={labelCls}>Check-in de {etiquetaMes(plan.mesActual)}</span>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={2000} className={`${inputCls} h-24 resize-none`} placeholder="Avances, obstáculos y apoyo necesario." />
          </label>
          <label><span className={labelCls}>Próximos pasos</span>
            <textarea value={pasos} onChange={e => setPasos(e.target.value)} maxLength={1000} className={`${inputCls} h-24 resize-none`} placeholder="Qué hará antes del próximo check-in." />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button type="button" onClick={() => ejecutar(() => registrarCheckin(plan.persona.id, comentario, pasos))} className="px-4 py-2 text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 rounded-xl">
              {delMes ? 'Actualizar check-in del mes' : 'Registrar check-in'}
            </button>
          </div>
        </div>
      )}
      {plan.checkins.length === 0 ? <p className="text-sm text-slate-400">Aún no hay check-ins.</p> : (
        <ol className="relative border-l-2 border-marca-100 ml-2 space-y-4">
          {plan.checkins.map(c => (
            <li key={c.id} className="relative pl-4">
              <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-acento-500 mt-1" aria-hidden />
              <p className="text-[11px] font-black uppercase text-marca-600">{etiquetaMes(c.periodo)}{c.autor && <span className="font-normal normal-case text-slate-400"> · {c.autor}</span>}</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.comentario}</p>
              {c.proximos_pasos && <p className="text-xs text-slate-500 mt-1"><strong>Próximos pasos:</strong> {c.proximos_pasos}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
