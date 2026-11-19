'use client'
import { useState } from 'react'
import type { Area, Empleado, FuncionesTarjeta } from '@/lib/tipos'
import { TarjetaEmpleado } from './TarjetaEmpleado'
import { useUmbrales, coloresDesempeno } from '@/lib/umbrales'

interface PropsTarjetaSaludArea {
  area: Area;
  empleadosArea: Empleado[];
  todosLosEmpleados: Empleado[];
  todasLasAreas: Area[];
  estaAbierta: boolean;
  onToggle: () => void;
  funcionesTarjeta: FuncionesTarjeta;
  asignarLiderArea: (aid: number, lid: string) => Promise<void>;
  asignarPadreArea: (aid: number, pid: string) => Promise<void>;
  calcularGantt: (creado: string, limite: string) => any;
  puedeEditarEstructura: boolean;                
  puedeEditarEmpleado: (emp: Empleado) => boolean;
  // Solo Admin
  renombrarArea?: (aid: number, nombre: string) => Promise<boolean>;
  eliminarArea?: (area: Area) => Promise<void>;
  // Jerarquía y búsqueda
  ruta?: Area[];                    // ancestros, de la raíz al padre
  opcionesPadre?: Area[];           // áreas válidas para "Depende de" (sin sí misma ni sus sub-áreas)
  empleadosVisibles?: Empleado[];   // si se está buscando: solo los colaboradores que coinciden
  atenuada?: boolean;               // se muestra solo como contexto de un resultado de búsqueda
 }


export function TarjetaSaludArea({
  area,
  empleadosArea,
  todosLosEmpleados,
  todasLasAreas,
  estaAbierta,
  onToggle,
  funcionesTarjeta,
  asignarLiderArea,
  asignarPadreArea,
  calcularGantt,
  puedeEditarEstructura, 
  puedeEditarEmpleado,
  renombrarArea,
  eliminarArea,
  ruta = [],
  opcionesPadre,
  empleadosVisibles,
  atenuada = false,
}: PropsTarjetaSaludArea) {
  const u = useUmbrales();
  const listaColaboradores = empleadosVisibles ?? empleadosArea;
  const filtrando = empleadosVisibles !== undefined && empleadosVisibles.length !== empleadosArea.length;
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(area.nombre);

  async function guardarNombre() {
    if (!renombrarArea) return;
    const ok = await renombrarArea(area.id, nombreEditado);
    if (ok) setEditandoNombre(false);
  }

  const total = empleadosArea.length;
  const promedio = total > 0
    ? Math.round(empleadosArea.reduce((acc, curr) => acc + curr.cumplimiento_general, 0) / total)
    : 0;

  // Métricas estratégicas de RRHH
  const enRiesgo = empleadosArea.filter(e => e.cumplimiento_general < u.umbral_desempeno_bajo).length;
  const estandar = empleadosArea.filter(e => e.cumplimiento_general >= u.umbral_desempeno_bajo && e.cumplimiento_general < u.umbral_desempeno_alto).length;
  const topPerformers = empleadosArea.filter(e => e.cumplimiento_general >= u.umbral_desempeno_alto).length;

  const todosLosPlanes = empleadosArea.flatMap(e => e.planes_mejora || []);
  const planesPendientes = todosLosPlanes.filter(p => p.estado !== 'completado').length;
  const planesVencidos = todosLosPlanes.filter(
    p => p.estado !== 'completado' && calcularGantt(p.created_at, p.fecha_limite).esVencido
  ).length;

  // Semáforo de Salud Organizacional
  let estadoSalud = { label: '🟢 En crecimiento', badgeClass: 'bg-acento-50 text-acento-700 border-acento-200' };
  if (total === 0) {
    estadoSalud = { label: '⚪ Sin Equipo', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' };
  } else if (promedio < u.umbral_desempeno_bajo || planesVencidos >= 3) {
    estadoSalud = { label: '🟠 Requiere acompañamiento', badgeClass: 'bg-amber-50 text-amber-800 border-amber-300' };
  } else if (promedio < u.umbral_desempeno_alto || planesVencidos > 0 || enRiesgo > 0) {
    estadoSalud = { label: '🔵 En avance', badgeClass: 'bg-marca-50 text-marca-700 border-marca-200' };
  }

  const liderActual = todosLosEmpleados.find(e => e.id === area.lider_id);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:opacity-100 ${
      ruta.length === 0 ? 'border-slate-300/80' : 'border-slate-200/80'
    } ${atenuada ? 'opacity-60' : ''}`}>
      {/* 1. CABECERA EJECUTIVA DEL ÁREA */}
      <div className="p-5 md:p-6 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

          {/* Identidad del Área & Líder */}
          <div className="space-y-1">
            {/* Ruta jerárquica: de dónde cuelga esta área */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 flex-wrap">
              {ruta.length === 0 ? (
                <span className="text-slate-500">Área principal</span>
              ) : (
                ruta.map((ancestro, i) => (
                  <span key={ancestro.id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-300">›</span>}
                    <span>{ancestro.nombre}</span>
                  </span>
                ))
              )}
              {ruta.length > 0 && <span className="text-slate-300">›</span>}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {editandoNombre ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    className="text-lg font-bold text-marca-950 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 outline-none focus:border-acento-500"
                    value={nombreEditado}
                    onChange={e => setNombreEditado(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') guardarNombre();
                      if (e.key === 'Escape') { setNombreEditado(area.nombre); setEditandoNombre(false); }
                    }}
                  />
                  <button type="button" onClick={guardarNombre} className="text-[11px] font-bold text-white bg-marca-900 px-2.5 py-1 rounded-lg hover:bg-marca-800">Guardar</button>
                  <button type="button" onClick={() => { setNombreEditado(area.nombre); setEditandoNombre(false); }} className="text-[11px] font-bold text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100">Cancelar</button>
                </div>
              ) : (
                <h2 className="text-xl font-bold text-marca-950 tracking-tight">{area.nombre}</h2>
              )}
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estadoSalud.badgeClass}`}>
                {estadoSalud.label}
              </span>
              {puedeEditarEstructura && !editandoNombre && (renombrarArea || eliminarArea) && (
                <div className="flex items-center gap-1">
                  {renombrarArea && (
                    <button type="button" onClick={() => { setNombreEditado(area.nombre); setEditandoNombre(true); }} title="Editar nombre del área" className="text-[11px] font-bold text-slate-500 hover:text-marca-900 hover:bg-slate-100 px-2 py-0.5 rounded-lg">
                      ✏️ Editar
                    </button>
                  )}
                  {eliminarArea && (
                    <button type="button" onClick={() => eliminarArea(area)} title="Eliminar área" className="text-[11px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded-lg">
                      🗑️ Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span>👑 Líder: <strong className="text-slate-700">{liderActual ? liderActual.nombre : 'Sin asignar'}</strong></span>
              <span>•</span>
              <span>👥 Headcount: <strong className="text-slate-700">{total} colaboradores</strong></span>
            </p>
          </div>

          {/* Score Promedio y Barra de Rendimiento */}
          <div className="flex items-center gap-5 shrink-0 bg-slate-50/70 p-3 px-4 rounded-xl border border-slate-100">
            <div className="w-36">
              <div className="flex justify-between items-center text-[11px] font-bold mb-1">
                <span className="text-slate-500 uppercase tracking-wider">Cumplimiento</span>
                <span className={coloresDesempeno(promedio, u).texto}>
                  {promedio}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${coloresDesempeno(promedio, u).barra}`}
                  style={{ width: `${promedio}%` }}
                />
              </div>
            </div>

            <div className="text-right pl-3 border-l border-slate-200">
              <span className="text-2xl font-black text-marca-900">{promedio}%</span>
              <span className="block text-[9px] uppercase font-bold text-slate-400">Promedio</span>
            </div>
          </div>
        </div>

        {/* 2. FRANJA ESTRATÉGICA (DISPERSIÓN Y COMPROMISOS) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs">
          
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Top Talent (≥85%)</span>
            <span className="text-sm font-black text-emerald-600">{topPerformers}</span>
            <span className="text-[10px] text-slate-400 ml-1">colaboradores</span>
          </div>

          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Estándar (60-84%)</span>
            <span className="text-sm font-black text-slate-700">{estandar}</span>
            <span className="text-[10px] text-slate-400 ml-1">colaboradores</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${enRiesgo > 0 ? 'bg-amber-50/80 border-amber-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Por impulsar (&lt;{u.umbral_desempeno_bajo}%)</span>
            <span className={`text-sm font-black ${enRiesgo > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{enRiesgo}</span>
            <span className="text-[10px] text-slate-400 ml-1">con oportunidad</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${planesVencidos > 0 ? 'bg-red-50/80 border-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Compromisos</span>
            <span className="text-sm font-black text-marca-900">{planesPendientes}</span>
            <span className="text-[10px] text-slate-400 ml-1">
              {planesVencidos > 0 ? `(${planesVencidos} vencidos ⚠️)` : 'activos'}
            </span>
          </div>

        </div>

        {/* 3. CONFIGURACIÓN RÁPIDA (LÍDER & REPORTE) + BOTÓN EXPANDIR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Líder:</span>
              {puedeEditarEstructura ? (
                <select
                  className="bg-slate-50 border border-slate-200 rounded-lg text-xs py-1 px-2 text-slate-700 outline-none focus:border-slate-400"
                  value={area.lider_id || ""}
                  onChange={(e) => asignarLiderArea(area.id, e.target.value)}
                >
                  <option value="">-- Sin Asignar --</option>
                  {todosLosEmpleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              ) : (
                <span className="text-xs font-semibold text-slate-700">
                  {liderActual ? liderActual.nombre : 'Sin asignar'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Depende de:</span>
              {puedeEditarEstructura ? (
                <select
                  className="bg-slate-50 border border-slate-200 rounded-lg text-xs py-1 px-2 text-slate-700 outline-none focus:border-slate-400"
                  value={area.parent_id || ""}
                  onChange={(e) => asignarPadreArea(area.id, e.target.value)}
                >
                  <option value="">(Principal)</option>
                  {(opcionesPadre ?? todasLasAreas.filter(a => a.id !== area.id)).map(a => (<option key={a.id} value={a.id}>{a.nombre}</option>))}
                </select>
              ) : (
                <span className="text-xs font-semibold text-slate-700">
                  {todasLasAreas.find(a => a.id === area.parent_id)?.nombre || '(Principal)'}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onToggle}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              estaAbierta
                ? 'bg-marca-950 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>
              {estaAbierta
                ? 'Ocultar Colaboradores'
                : filtrando ? `Ver ${listaColaboradores.length} de ${total} Colaboradores` : `Ver ${total} Colaboradores`}
            </span>
            <span className="text-[10px]">{estaAbierta ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* 4. LISTA DE COLABORADORES (SOLO VISIBLE SI SE EXPANDE) */}
      {estaAbierta && (
        <div className="p-5 md:p-6 bg-slate-50/50 border-t border-slate-200/80 animate-in slide-in-from-top-2">
          {filtrando && (
            <p className="text-[11px] text-slate-500 mb-3">
              Mostrando {listaColaboradores.length} de {total} colaboradores que coinciden con la búsqueda.
            </p>
          )}
          {listaColaboradores.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {listaColaboradores.map(emp => (
                <TarjetaEmpleado
                  key={emp.id}
                  emp={emp}
                  esLider={area.lider_id === emp.id}
                  areas={todasLasAreas}
                  allowEdit={puedeEditarEmpleado(emp)}
                  funciones={funcionesTarjeta}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 italic py-6">
              {filtrando ? 'Ningún colaborador de esta área coincide con la búsqueda.' : 'No hay colaboradores asignados a esta área todavía.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
