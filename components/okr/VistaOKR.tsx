'use client'
// Objetivos (OKR) en cascada Empresa → Área → Persona. Todos los ven; gestionan el Admin (empresa y áreas) y cada
// líder (su área). El avance lo calcula /api/okr.
import { useEffect, useMemo, useState } from 'react'
import type { Area } from '@/lib/tipos'
import type { EntradaDirectorio } from '@/lib/datos'
import { etiquetaTrimestre, krsParaAlinear, progresoMedido, type ObjetivoOKR, type ResultadoClave } from '@/lib/okr'
import {
  actualizarKr, cargarOKR, eliminarKr, eliminarObjetivo, guardarKr, guardarObjetivo,
  type DatosKr, type DatosObjetivo, type RespuestaOKR,
} from '@/lib/okrApi'
import { coloresDesempeno, useUmbrales } from '@/lib/umbrales'
import { mensajeDeError } from '@/lib/errores'

interface Props { areas: Area[]; directorio: EntradaDirectorio[]; onCambio?: () => void }

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-acento-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

type Edicion =
  | { tipo: 'objetivo'; datos: DatosObjetivo; areasPosibles?: Area[]; krsPadre?: ResultadoClave[] }
  | { tipo: 'kr'; datos: DatosKr };

export function VistaOKR({ areas, directorio, onCambio }: Props) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [trimestre, setTrimestre] = useState(Math.floor(hoy.getMonth() / 3) + 1);
  const [datos, setDatos] = useState<RespuestaOKR | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);

  const [version, setVersion] = useState(0); // se incrementa para recargar tras un cambio

  useEffect(() => {
    let vigente = true;
    cargarOKR(anio, trimestre)
      .then(r => { if (vigente) { setDatos(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [anio, trimestre, version]);

  async function ejecutar(f: () => Promise<void>) {
    try { await f(); setEdicion(null); setVersion(v => v + 1); onCambio?.(); }
    catch (e) { alert(mensajeDeError(e)); }
  }

  const nombrePersona = useMemo(() => new Map(directorio.map(d => [d.id, d.nombre])), [directorio]);
  const empresa = datos?.objetivos.filter(o => o.area_id === null) ?? [];
  const pctAlineado = datos && datos.alineacion.total > 0 ? Math.round((datos.alineacion.alineados / datos.alineacion.total) * 100) : null;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-marca-900">🎯 Objetivos (OKR)</h2>
          <p className="text-sm text-slate-500">Cómo el trabajo de cada persona aporta a los objetivos de su área y de la empresa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="text-xs font-bold bg-white border border-marca-100 rounded-xl px-3 py-2 text-marca-900" value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año">
            {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex gap-1 bg-marca-50 p-1 rounded-xl" role="tablist" aria-label="Trimestre">
            {[1, 2, 3, 4].map(t => (
              <button key={t} type="button" role="tab" aria-selected={trimestre === t} onClick={() => setTrimestre(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${trimestre === t ? 'bg-white text-marca-900 shadow-sm' : 'text-marca-500 hover:text-marca-900'}`}>T{t}</button>
            ))}
          </div>
          {datos?.permisos.empresa && (
            <button type="button" onClick={() => setEdicion({ tipo: 'objetivo', datos: { area_id: null, anio, titulo: '' } })}
              className="px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">+ Objetivo de la empresa</button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p>}

      {datos && (
        <div className="flex flex-wrap gap-3">
          <span className="text-xs font-bold bg-white border border-marca-100 rounded-full px-3 py-1.5 text-marca-700">📅 {etiquetaTrimestre(anio, trimestre)}</span>
          {pctAlineado !== null && (
            <span className={`text-xs font-bold rounded-full px-3 py-1.5 border ${pctAlineado >= 80 ? 'bg-acento-50 border-acento-200 text-acento-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
              title="KPIs de personas activas vinculados a un resultado clave de su área">
              🧭 {pctAlineado}% de los KPIs aportan a un OKR ({datos.alineacion.alineados} de {datos.alineacion.total})
            </span>
          )}
        </div>
      )}

      {datos && empresa.length === 0 && (
        <div className="bg-white border border-dashed border-marca-200 rounded-3xl p-8 text-center">
          <p className="text-4xl">🎯</p>
          <p className="font-bold text-marca-900 mt-2">Aún no hay objetivos de la empresa para {anio}.</p>
          <p className="text-sm text-slate-500 mt-1">{datos.permisos.empresa ? 'Crea el primero: las áreas alinearán sus objetivos a sus resultados clave.' : 'El Admin los definirá; luego cada área alineará los suyos.'}</p>
        </div>
      )}

      {datos && empresa.map(o => (
        <TarjetaObjetivo key={o.id} objetivo={o} datos={datos} areas={areas} anio={anio} trimestre={trimestre} nivel={0}
          nombrePersona={nombrePersona} onEditar={setEdicion} ejecutar={ejecutar} />
      ))}

      {edicion && datos && (
        <Formulario edicion={edicion} directorio={directorio} areas={areas} onCancelar={() => setEdicion(null)}
          onGuardar={d => ejecutar(() => edicion.tipo === 'objetivo' ? guardarObjetivo(d as DatosObjetivo) : guardarKr(d as DatosKr))} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------

interface PropsTarjeta {
  objetivo: ObjetivoOKR; datos: RespuestaOKR; areas: Area[]; anio: number; trimestre: number; nivel: number;
  nombrePersona: Map<number, string>; onEditar: (e: Edicion) => void; ejecutar: (f: () => Promise<void>) => Promise<void>;
}

function TarjetaObjetivo({ objetivo: o, datos, areas, anio, trimestre, nivel, nombrePersona, onEditar, ejecutar }: PropsTarjeta) {
  const u = useUmbrales();
  const puede = o.area_id === null ? datos.permisos.empresa : datos.permisos.areas.includes(o.area_id);
  const area = areas.find(a => a.id === o.area_id);
  const avance = datos.avance.objetivo[o.id] ?? null;
  const krs = datos.krs.filter(k => k.objetivo_id === o.id);
  const delTrimestre = krs.filter(k => k.trimestre === trimestre);
  const otros = krs.length - delTrimestre.length;

  return (
    <div className={`bg-white rounded-3xl border ${nivel === 0 ? 'border-marca-100 shadow-sm' : 'border-marca-50'} overflow-hidden`}>
      <div className={`p-5 flex flex-wrap items-start justify-between gap-4 ${nivel === 0 ? 'bg-gradient-to-r from-marca-50 to-white' : ''}`}>
        <div className="min-w-0 flex-1">
          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${o.area_id === null ? 'bg-marca-900 text-white' : 'bg-acento-50 text-acento-800 border border-acento-200'}`}>
            {o.area_id === null ? '🏢 Empresa' : `💼 ${area?.nombre ?? 'Área'}`}
          </span>
          <h3 className={`font-extrabold text-marca-900 mt-2 ${nivel === 0 ? 'text-lg' : 'text-base'}`}>{o.titulo}</h3>
          {o.descripcion && <p className="text-xs text-slate-500 mt-0.5">{o.descripcion}</p>}
          {o.responsable_id && <p className="text-[11px] text-slate-500 mt-1">Responsable: <strong className="text-marca-800">{nombrePersona.get(o.responsable_id) ?? '—'}</strong></p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className={`font-titulo text-2xl font-extrabold ${avance === null ? 'text-slate-300' : coloresDesempeno(avance, u).texto}`}>{avance === null ? '—' : `${avance}%`}</span>
            <span className="block text-[9px] font-bold uppercase text-slate-400">avance T{trimestre}</span>
          </div>
          {puede && (
            <div className="flex flex-col gap-1">
              <button type="button" className="text-[11px] font-bold text-marca-600 hover:bg-marca-50 px-2 py-0.5 rounded-lg"
                onClick={() => onEditar({ tipo: 'objetivo', datos: { id: o.id, titulo: o.titulo, descripcion: o.descripcion, responsable_id: o.responsable_id, kr_padre_id: o.kr_padre_id } })}>✏️ Editar</button>
              <button type="button" className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-0.5 rounded-lg"
                onClick={() => window.confirm(`¿Eliminar "${o.titulo}" con sus resultados clave? Los objetivos alineados quedarán sin alinear y los KPIs vinculados quedarán como operativos.`) && ejecutar(() => eliminarObjetivo(o.id))}>🗑️</button>
            </div>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-marca-50"><div className={`h-full ${avance === null ? '' : coloresDesempeno(avance, u).barra} transition-all duration-700`} style={{ width: `${avance ?? 0}%` }} /></div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-marca-400">Resultados clave · T{trimestre}{otros > 0 && <span className="normal-case font-semibold text-slate-400"> · {otros} en otros trimestres</span>}</p>
          {puede && (
            <button type="button" className="text-[11px] font-bold text-acento-700 hover:underline"
              onClick={() => onEditar({ tipo: 'kr', datos: { objetivo_id: o.id, titulo: '', trimestre, tipo_medicion: 'calculado', meta: null, valor_inicial: 0, direccion: 'creciente' } })}>+ Resultado clave</button>
          )}
        </div>
        {delTrimestre.length === 0 && <p className="text-xs text-slate-400 italic">Sin resultados clave en T{trimestre}.</p>}
        {delTrimestre.map(k => (
          <FilaKr key={k.id} kr={k} objetivo={o} puede={puede} {...{ datos, areas, anio, trimestre, nivel, nombrePersona, onEditar, ejecutar }} />
        ))}
      </div>
    </div>
  );
}

function FilaKr({ kr, objetivo, puede, datos, areas, anio, trimestre, nivel, nombrePersona, onEditar, ejecutar }: Omit<PropsTarjeta, 'objetivo'> & { kr: ResultadoClave; objetivo: ObjetivoOKR; puede: boolean }) {
  const u = useUmbrales();
  const [abierto, setAbierto] = useState(nivel === 0);
  const [valor, setValor] = useState(kr.resultado_actual === null ? '' : String(kr.resultado_actual));
  const avance = datos.avance.kr[kr.id] ?? null;
  const alineados = datos.objetivos.filter(o => o.kr_padre_id === kr.id);
  const kpis = datos.kpisPorKr[kr.id];
  // Áreas que pueden alinear un objetivo a este KR: las del nivel inmediatamente inferior que el usuario gestiona
  const areasHijas = areas.filter(a => (a.parent_id ?? null) === (objetivo.area_id ?? null) && datos.permisos.areas.includes(a.id));

  async function guardarValor() {
    const limpio = valor.trim().replace(',', '.');
    const numero = limpio === '' ? null : Number(limpio);
    if (numero !== null && !Number.isFinite(numero)) return;
    if (numero === kr.resultado_actual) return;
    await ejecutar(() => actualizarKr(kr.id, numero));
  }

  return (
    <div className="border border-marca-100 rounded-2xl">
      <div className="p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-marca-900">{kr.titulo}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {kr.tipo_medicion === 'medido'
              ? <>📏 Medido · meta {kr.meta?.toLocaleString('es-CO')} {kr.unidad || ''}{kr.valor_inicial ? ` (desde ${kr.valor_inicial.toLocaleString('es-CO')})` : ''}{kr.direccion === 'decreciente' ? ' · menos es mejor' : ''}</>
              : <>🔗 Calculado · {kpis?.total ?? 0} KPI(s){alineados.length > 0 && ` y ${alineados.length} objetivo(s) de área`}</>}
          </p>
        </div>
        {kr.tipo_medicion === 'medido' && (
          puede ? (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              Actual
              <input className="w-24 text-xs font-bold text-marca-900 border border-slate-200 rounded-lg px-2 py-1 focus:border-acento-500 outline-none" inputMode="decimal"
                value={valor} onChange={e => setValor(e.target.value)} onBlur={guardarValor} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </label>
          ) : <span className="text-xs text-slate-500">Actual: <strong>{kr.resultado_actual ?? '—'}</strong></span>
        )}
        <div className="w-28">
          <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-400">Avance</span><span className={avance === null ? 'text-slate-300' : coloresDesempeno(avance, u).texto}>{avance === null ? '—' : `${avance}%`}</span></div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1"><div className={`h-full rounded-full ${avance === null ? '' : coloresDesempeno(avance, u).barra}`} style={{ width: `${avance ?? 0}%` }} /></div>
        </div>
        {kr.tipo_medicion === 'medido' && avance === null && progresoMedido(kr) === null && <span className="text-[10px] text-amber-700">Sin resultado</span>}
        <div className="flex items-center gap-1">
          {(alineados.length > 0 || (kpis?.total ?? 0) > 0) && (
            <button type="button" onClick={() => setAbierto(!abierto)} className="text-[11px] font-bold text-marca-600 hover:bg-marca-50 px-2 py-1 rounded-lg">{abierto ? '▲' : '▼'} Cascada</button>
          )}
          {puede && (
            <>
              <button type="button" className="text-[11px] text-marca-600 hover:bg-marca-50 px-2 py-1 rounded-lg" title="Editar"
                onClick={() => onEditar({ tipo: 'kr', datos: { id: kr.id, titulo: kr.titulo, trimestre: kr.trimestre, tipo_medicion: kr.tipo_medicion, meta: kr.meta, valor_inicial: kr.valor_inicial, unidad: kr.unidad, direccion: kr.direccion } })}>✏️</button>
              <button type="button" className="text-[11px] text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg" title="Eliminar"
                onClick={() => window.confirm(`¿Eliminar "${kr.titulo}"? ${alineados.length ? `${alineados.length} objetivo(s) alineado(s) quedarán sin alinear. ` : ''}${kpis?.total ? `${kpis.total} KPI(s) quedarán como operativos.` : ''}`) && ejecutar(() => eliminarKr(kr.id))}>🗑️</button>
            </>
          )}
        </div>
      </div>

      {abierto && (
        <div className="border-t border-marca-50 bg-fondo/60 p-3 space-y-3 rounded-b-2xl">
          {kpis && kpis.total > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-marca-400 mb-1">👥 KPIs que aportan · {kpis.conAvance} de {kpis.total} con avance en T{trimestre}</p>
              {kpis.visibles.length > 0 ? (
                <ul className="grid sm:grid-cols-2 gap-1.5">
                  {kpis.visibles.map(k => (
                    <li key={k.id} className="text-xs bg-white border border-marca-50 rounded-lg px-2.5 py-1.5 flex justify-between gap-2">
                      <span className="truncate"><strong className="text-marca-900">{k.persona}</strong> · {k.titulo}</span>
                      <span className={`font-bold ${k.progreso === null ? 'text-slate-300' : coloresDesempeno(k.progreso, u).texto}`}>{k.progreso === null ? '—' : `${k.progreso}%`}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[11px] text-slate-400 italic">El detalle de estos KPIs es visible para sus líderes.</p>}
              {kpis.visibles.length > 0 && kpis.visibles.length < kpis.total && <p className="text-[10px] text-slate-400 mt-1">+ {kpis.total - kpis.visibles.length} fuera de tu equipo.</p>}
            </div>
          )}
          {alineados.map(hijo => (
            <div key={hijo.id} className="pl-3 border-l-2 border-acento-200">
              <TarjetaObjetivo objetivo={hijo} datos={datos} areas={areas} anio={anio} trimestre={trimestre} nivel={nivel + 1}
                nombrePersona={nombrePersona} onEditar={onEditar} ejecutar={ejecutar} />
            </div>
          ))}
        </div>
      )}
      {areasHijas.length > 0 && (
        <div className="px-3 pb-3">
          <button type="button" className="text-[11px] font-bold text-acento-700 hover:underline"
            onClick={() => onEditar({ tipo: 'objetivo', datos: { anio, titulo: '', kr_padre_id: kr.id, area_id: areasHijas.length === 1 ? areasHijas[0].id : null }, areasPosibles: areasHijas, krsPadre: krsParaAlinear(areasHijas[0].id, datos.objetivos, datos.krs, areas, anio) })}>
            + Objetivo de {areasHijas.length === 1 ? areasHijas[0].nombre : 'área'} alineado a este resultado clave
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------

function Formulario({ edicion, directorio, areas, onCancelar, onGuardar }: {
  edicion: Edicion; directorio: EntradaDirectorio[]; areas: Area[]; onCancelar: () => void; onGuardar: (d: DatosObjetivo | DatosKr) => void;
}) {
  const [d, setD] = useState<DatosObjetivo | DatosKr>(edicion.datos);
  const set = (k: string, v: unknown) => setD(prev => ({ ...prev, [k]: v }));
  const esObjetivo = edicion.tipo === 'objetivo';
  const o = d as DatosObjetivo, k = d as DatosKr;
  const nuevo = !d.id;
  const areaElegida = esObjetivo ? o.area_id : null;
  const responsables = esObjetivo ? directorio.filter(p => areaElegida == null || p.area_id === areaElegida) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 backdrop-blur-sm p-4 animate-in fade-in">
      <form className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 space-y-4" onSubmit={e => { e.preventDefault(); onGuardar(d); }}>
        <h3 className="text-base font-bold text-marca-900">
          {esObjetivo ? (nuevo ? (o.kr_padre_id ? 'Nuevo objetivo de área (alineado)' : 'Nuevo objetivo de la empresa') : 'Editar objetivo') : (nuevo ? 'Nuevo resultado clave' : 'Editar resultado clave')}
        </h3>

        {esObjetivo ? (
          <>
            {nuevo && edicion.tipo === 'objetivo' && edicion.areasPosibles && edicion.areasPosibles.length > 1 && (
              <div>
                <label className={labelCls}>Área</label>
                <select className={inputCls} required value={o.area_id ?? ''} onChange={e => set('area_id', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">-- Seleccionar --</option>
                  {edicion.areasPosibles.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Objetivo *</label>
              <input className={inputCls} autoFocus value={o.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Ampliar nuestra participación en el mercado" />
              <p className="text-[10px] text-slate-400 mt-1">Cualitativo e inspirador: el qué. Los resultados clave miden el cuánto.</p>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <textarea className={`${inputCls} min-h-[60px]`} value={o.descripcion ?? ''} onChange={e => set('descripcion', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Responsable</label>
              <select className={inputCls} value={o.responsable_id ?? ''} onChange={e => set('responsable_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">{areaElegida != null ? 'Líder del área' : '-- Sin responsable --'}</option>
                {responsables.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.puesto}</option>)}
              </select>
            </div>
            {o.kr_padre_id && <p className="text-[11px] text-acento-800 bg-acento-50 border border-acento-200 rounded-xl p-2.5">🔗 Se alinea al resultado clave elegido; su avance sumará al de ese resultado clave.</p>}
            {!o.kr_padre_id && o.area_id === null && areas.length > 0 && <p className="text-[11px] text-slate-500">Las áreas principales alinearán sus objetivos a los resultados clave de este objetivo.</p>}
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Resultado clave *</label>
              <input className={inputCls} autoFocus value={k.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Aumentar las ventas nuevas a 500 M" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Trimestre *</label>
                <select className={inputCls} value={k.trimestre} onChange={e => set('trimestre', Number(e.target.value))}>
                  {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cómo se mide *</label>
                <select className={inputCls} value={k.tipo_medicion} onChange={e => set('tipo_medicion', e.target.value)}>
                  <option value="calculado">🔗 Calculado (lo que aporta el equipo)</option>
                  <option value="medido">📏 Medido (meta propia)</option>
                </select>
              </div>
            </div>
            {k.tipo_medicion === 'calculado' ? (
              <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-2.5">Su avance es el promedio de los KPIs vinculados (con resultado en el trimestre) y de los objetivos de área alineados a él.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Valor inicial</label><input className={inputCls} inputMode="decimal" value={k.valor_inicial} onChange={e => set('valor_inicial', e.target.value)} /></div>
                <div><label className={labelCls}>Meta *</label><input className={inputCls} inputMode="decimal" value={k.meta ?? ''} onChange={e => set('meta', e.target.value)} /></div>
                <div><label className={labelCls}>Unidad</label><input className={inputCls} value={k.unidad ?? ''} onChange={e => set('unidad', e.target.value)} placeholder="COP, clientes, %…" /></div>
                <div>
                  <label className={labelCls}>Dirección</label>
                  <select className={inputCls} value={k.direccion} onChange={e => set('direccion', e.target.value)}>
                    <option value="creciente">Más es mejor</option>
                    <option value="decreciente">Menos es mejor</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl">Guardar</button>
        </div>
      </form>
    </div>
  );
}
