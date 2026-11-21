'use client'
// Inicio → "Mi equipo": la jerarquía por personas con zoom por niveles. Tu equipo directo (con su cumplimiento
// del mes, el de su equipo directo y el de toda su rama) y, al entrar a un líder, su equipo, y así sucesivamente.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Area, Empleado, FuncionesTarjeta } from '@/lib/tipos'
import { metricasDelMes, ordenarEquipo, primerNivel, type MetricasPersona } from '@/lib/equipo'
import { claveMes, etiquetaMes } from '@/lib/periodos'
import { coloresDesempeno, useUmbrales } from '@/lib/umbrales'
import { TarjetaEmpleado } from '@/components/TarjetaEmpleado'

interface Props {
  /** Personas visibles (activas) según el alcance de quien mira */
  empleados: Empleado[];
  areas: Area[];
  /** Ficha de quien mira (puede no estar entre los visibles) */
  yo: Empleado | null;
  puedeEditar: (emp: Empleado) => boolean;
  funciones: FuncionesTarjeta;
  /** Persona elegida en el buscador: se ubica en la jerarquía, se resalta y se abre su panel (marca cambia en cada elección) */
  seleccion?: { id: number; marca: number } | null;
}

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export function MiEquipo({ empleados, areas, yo, puedeEditar, funciones, seleccion }: Props) {
  const u = useUmbrales();
  const [ruta, setRuta] = useState<number[]>([]); // personas en las que se hizo zoom
  const [abierto, setAbierto] = useState<Empleado | null>(null);

  const todos = useMemo(() => (yo && !empleados.some(e => e.id === yo.id) ? [...empleados, yo] : empleados), [empleados, yo]);
  const metricas = useMemo(() => metricasDelMes(todos, areas), [todos, areas]);
  const porId = useMemo(() => new Map(todos.map(e => [e.id, e])), [todos]);
  const liderDe = (id: number) => areas.find(a => a.lider_id === id);

  const enFoco = ruta.length ? porId.get(ruta[ruta.length - 1]) ?? null : null;
  const idsNivel = enFoco ? metricas.get(enFoco.id)?.directos ?? [] : primerNivel(yo?.id ?? null, empleados, areas);
  const nivel = ordenarEquipo(idsNivel, todos, metricas);
  const yoLidera = !!yo && (metricas.get(yo.id)?.directos.length ?? 0) > 0;

  // Resumen del primer nivel cuando quien mira no lidera (Admin/Auditor): toda la organización
  const resumenOrg = useMemo(() => {
    const vals = empleados.map(e => metricas.get(e.id)?.personal ?? null).filter((x): x is number => x !== null);
    return { promedio: vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null, personas: empleados.length,
      pendientes: empleados.reduce((s, e) => s + (metricas.get(e.id)?.pendientes ?? 0), 0) };
  }, [empleados, metricas]);

  function abrir(emp: Empleado) {
    setAbierto(emp);
  }

  // Selección desde el buscador: niveles por los que hay que bajar hasta llegar a la persona
  const [procesada, setProcesada] = useState<number | null>(null);
  const [resaltado, setResaltado] = useState<number | null>(null);
  if (seleccion && seleccion.marca !== procesada) {
    setProcesada(seleccion.marca);
    const inicio = primerNivel(yo?.id ?? null, empleados, areas);
    const cola: [number, number[]][] = inicio.map(id => [id, []]);
    const vistos = new Set<number>();
    let camino: number[] = [];
    while (cola.length) {
      const [id, ruta0] = cola.shift()!;
      if (id === seleccion.id) { camino = ruta0; break; }
      if (vistos.has(id)) continue;
      vistos.add(id);
      (metricas.get(id)?.directos ?? []).forEach(h => cola.push([h, [...ruta0, id]]));
    }
    setRuta(camino);
    setResaltado(seleccion.id);
    const emp = porId.get(seleccion.id);
    if (emp) setAbierto(emp);
  }
  useEffect(() => {
    if (resaltado === null) return;
    const t = setTimeout(() => setResaltado(null), 5000);
    return () => clearTimeout(t);
  }, [resaltado]);

  return (
    <div className="space-y-5">
      {/* Migas de pan + período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Nivel" className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => setRuta([])} className={`font-bold ${ruta.length ? 'text-marca-500 hover:text-marca-900' : 'text-marca-900'}`}>
            {yoLidera ? '👥 Mi equipo' : '🏢 Organización'}
          </button>
          {ruta.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              <span className="text-slate-300">›</span>
              <button type="button" onClick={() => setRuta(ruta.slice(0, i + 1))}
                className={`font-bold ${i === ruta.length - 1 ? 'text-marca-900' : 'text-marca-500 hover:text-marca-900'}`}>
                {porId.get(id)?.nombre.split(' ')[0]}{liderDe(id) ? ` (${liderDe(id)!.nombre})` : ''}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {ruta.length > 0 && <button type="button" onClick={() => setRuta(ruta.slice(0, -1))} className="text-xs font-bold text-marca-600 hover:bg-marca-50 px-3 py-1.5 rounded-xl">← Subir un nivel</button>}
          <span className="text-[11px] font-bold bg-acento-50 text-acento-800 border border-acento-200 px-3 py-1 rounded-full">📅 Cumplimiento de {etiquetaMes(claveMes())}</span>
        </div>
      </div>

      {/* Tarjeta del nivel en foco */}
      {enFoco ? (
        <Foco emp={enFoco} m={metricas.get(enFoco.id)!} area={liderDe(enFoco.id)} onVerKpis={() => abrir(enFoco)} />
      ) : yoLidera && yo ? (
        <Foco emp={yo} m={metricas.get(yo.id)!} area={liderDe(yo.id)} titulo="Tú" onVerKpis={() => abrir(yo)} />
      ) : (
        <div className="bg-gradient-to-r from-marca-900 to-marca-700 text-white rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-marca-200">🏢 Toda la organización</p>
            <p className="text-lg font-extrabold mt-1">{resumenOrg.personas} personas · {resumenOrg.pendientes} KPI(s) por calificar este mes</p>
          </div>
          <span className="font-titulo text-4xl font-extrabold">{resumenOrg.promedio === null ? '—' : `${resumenOrg.promedio}%`}</span>
        </div>
      )}

      {/* Equipo del nivel */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-wider text-marca-400 mb-3">
          {enFoco ? `Equipo directo de ${enFoco.nombre.split(' ')[0]}` : yoLidera ? 'Tu equipo directo' : 'Primer nivel de la organización'} · {nivel.length}
          {!enFoco && yoLidera ? ' · puedes calificar sus KPIs' : ''}
        </p>
        {nivel.length === 0 ? (
          <p className="text-sm text-slate-400 italic bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center">No hay personas en este nivel.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {nivel.map(emp => (
              <TarjetaPersona key={emp.id} emp={emp} m={metricas.get(emp.id)!} area={liderDe(emp.id)} u={u} resaltada={resaltado === emp.id}
                onVerKpis={() => abrir(emp)} onVerEquipo={() => setRuta([...ruta, emp.id])} />
            ))}
          </div>
        )}
      </div>

      {/* Panel lateral con la tarjeta completa (editable si es reporte directo) */}
      {abierto && (
        <div className="fixed inset-0 z-40 flex justify-end bg-marca-950/40 backdrop-blur-[2px] animate-in fade-in" onClick={() => setAbierto(null)}>
          <aside className="w-full max-w-xl h-full bg-fondo shadow-2xl overflow-y-auto custom-scrollbar animate-in slide-in-from-right" onClick={e => e.stopPropagation()} aria-label={`KPIs de ${abierto.nombre}`}>
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-marca-100 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-marca-900">{abierto.nombre}</p>
                <p className="text-[11px] text-slate-500">{puedeEditar(abierto) ? '✏️ Puedes calificar sus KPIs' : '👁️ Solo lectura'}</p>
              </div>
              <button type="button" onClick={() => setAbierto(null)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200" aria-label="Cerrar">✕</button>
            </div>
            <div className="p-4">
              <TarjetaEmpleado emp={porId.get(abierto.id) ?? abierto} esLider={!!liderDe(abierto.id)} areas={areas} allowEdit={puedeEditar(abierto)} funciones={{ ...funciones, expandidoId: abierto.id }} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------

function Cifra({ valor, u, grande = false }: { valor: number | null; u: ReturnType<typeof useUmbrales>; grande?: boolean }) {
  return <span className={`font-titulo font-extrabold ${grande ? 'text-4xl' : 'text-3xl'} ${valor === null ? 'text-slate-300' : coloresDesempeno(valor, u).texto}`}>{valor === null ? '—' : `${valor}%`}</span>;
}

function Tendencia({ t }: { t: number | null }) {
  if (t === null || t === 0) return null;
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${t > 0 ? 'bg-acento-50 text-acento-700' : 'bg-amber-50 text-amber-700'}`}>{t > 0 ? '▲' : '▼'} {Math.abs(t)}</span>;
}

function Barra({ etiqueta, valor, detalle, u }: { etiqueta: string; valor: number | null; detalle?: string; u: ReturnType<typeof useUmbrales> }) {
  return (
    <div>
      <div className="flex justify-between text-[11px]"><span className="text-slate-500">{etiqueta}{detalle && <span className="text-slate-400"> · {detalle}</span>}</span>
        <span className={`font-bold ${valor === null ? 'text-slate-300' : coloresDesempeno(valor, u).texto}`}>{valor === null ? '—' : `${valor}%`}</span></div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1"><div className={`h-full rounded-full ${valor === null ? '' : coloresDesempeno(valor, u).barra}`} style={{ width: `${valor ?? 0}%` }} /></div>
    </div>
  );
}

function Pendientes({ propios, rama }: { propios: number; rama?: number }) {
  if (propios === 0 && !rama) return <span className="text-[10px] font-semibold text-acento-700">✓ Al día</span>;
  return (
    <span className="text-[10px] font-semibold text-amber-700">
      ⏰ {propios > 0 && `${propios} KPI(s) por calificar`}{propios > 0 && rama ? ' · ' : ''}{rama ? `${rama} en su rama` : ''}
    </span>
  );
}

function TarjetaPersona({ emp, m, area, u, resaltada, onVerKpis, onVerEquipo }: {
  emp: Empleado; m: MetricasPersona; area?: Area; u: ReturnType<typeof useUmbrales>; resaltada?: boolean; onVerKpis: () => void; onVerEquipo: () => void;
}) {
  const lidera = m.directos.length > 0;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (resaltada) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [resaltada]);
  return (
    <div ref={ref} className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-3 transition-shadow ${resaltada ? 'ring-4 ring-amber-300 ring-offset-2' : ''} ${area ? 'border-amber-200' : 'border-marca-100'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 shrink-0 rounded-full text-white text-sm font-bold flex items-center justify-center ${area ? 'bg-gradient-to-br from-amber-300 to-amber-500' : 'bg-gradient-to-br from-marca-400 to-marca-600'}`} aria-hidden>{iniciales(emp.nombre)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-marca-900 truncate" title={emp.nombre}>{emp.nombre}</p>
          <p className="text-[11px] text-slate-500 truncate">{emp.puesto}</p>
          {area && <p className="text-[10px] font-bold text-amber-700 mt-0.5">👑 Lidera {area.nombre}</p>}
        </div>
        <div className="text-right">
          <Cifra valor={m.personal} u={u} />
          <div className="flex justify-end mt-0.5"><Tendencia t={m.tendencia} /></div>
        </div>
      </div>
      {lidera && (
        <div className="space-y-2 bg-fondo rounded-xl p-3">
          <Barra etiqueta="Equipo directo" detalle={`${m.directos.length}`} valor={m.equipo} u={u} />
          <Barra etiqueta="Toda la rama" detalle={`${m.nRama} personas`} valor={m.rama} u={u} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <Pendientes propios={m.pendientes} rama={lidera ? m.pendientesRama : undefined} />
        <div className="flex gap-1.5 shrink-0">
          <button type="button" onClick={onVerKpis} className="text-[11px] font-bold text-marca-700 bg-marca-50 hover:bg-marca-100 px-2.5 py-1.5 rounded-lg">Ver KPIs</button>
          {lidera && <button type="button" onClick={onVerEquipo} className="text-[11px] font-bold text-white bg-marca-900 hover:bg-marca-800 px-2.5 py-1.5 rounded-lg">Ver equipo ›</button>}
        </div>
      </div>
    </div>
  );
}

function Foco({ emp, m, area, titulo, onVerKpis }: { emp: Empleado; m: MetricasPersona; area?: Area; titulo?: string; onVerKpis: () => void }) {
  const u = useUmbrales();
  return (
    <div className="bg-white rounded-3xl border border-marca-100 shadow-sm p-5 md:p-6 grid md:grid-cols-[1.2fr_1fr] gap-5 items-center">
      <div className="flex items-center gap-4 min-w-0">
        <span className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-white text-lg font-bold flex items-center justify-center" aria-hidden>{iniciales(emp.nombre)}</span>
        <div className="min-w-0">
          {titulo && <p className="text-[10px] font-black uppercase tracking-wider text-marca-400">{titulo}</p>}
          <h2 className="text-xl font-extrabold text-marca-900 truncate">{emp.nombre}</h2>
          <p className="text-xs text-slate-500">{emp.puesto}{area && <> · <span className="font-bold text-amber-700">👑 Lidera {area.nombre}</span></>}</p>
          <div className="flex items-center gap-2 mt-2">
            <Cifra valor={m.personal} u={u} grande />
            <div className="flex flex-col gap-1"><Tendencia t={m.tendencia} /><span className="text-[10px] text-slate-400">personal</span></div>
            <button type="button" onClick={onVerKpis} className="ml-2 text-[11px] font-bold text-marca-700 bg-marca-50 hover:bg-marca-100 px-2.5 py-1.5 rounded-lg">Ver KPIs</button>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <Barra etiqueta="Equipo directo" detalle={`${m.directos.length} personas`} valor={m.equipo} u={u} />
        <Barra etiqueta="Toda la rama" detalle={`${m.nRama} personas`} valor={m.rama} u={u} />
        <Pendientes propios={m.pendientes} rama={m.pendientesRama} />
      </div>
    </div>
  );
}
