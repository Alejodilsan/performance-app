'use client'
import type { Area, Empleado, FuncionesTarjeta } from '@/lib/tipos'
import { TarjetaEmpleado } from './TarjetaEmpleado'

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
}: PropsTarjetaSaludArea) {
  const total = empleadosArea.length;
  const promedio = total > 0
    ? Math.round(empleadosArea.reduce((acc, curr) => acc + curr.cumplimiento_general, 0) / total)
    : 0;

  // Métricas estratégicas de RRHH
  const enRiesgo = empleadosArea.filter(e => e.cumplimiento_general < 60).length;
  const estandar = empleadosArea.filter(e => e.cumplimiento_general >= 60 && e.cumplimiento_general < 85).length;
  const topPerformers = empleadosArea.filter(e => e.cumplimiento_general >= 85).length;

  const todosLosPlanes = empleadosArea.flatMap(e => e.planes_mejora || []);
  const planesPendientes = todosLosPlanes.filter(p => p.estado !== 'completado').length;
  const planesVencidos = todosLosPlanes.filter(
    p => p.estado !== 'completado' && calcularGantt(p.created_at, p.fecha_limite).esVencido
  ).length;

  // Semáforo de Salud Organizacional
  let estadoSalud = { label: '🟢 Saludable', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (total === 0) {
    estadoSalud = { label: '⚪ Sin Equipo', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' };
  } else if (promedio < 60 || planesVencidos >= 3) {
    estadoSalud = { label: '🔴 Riesgo Crítico', badgeClass: 'bg-red-50 text-red-700 border-red-200' };
  } else if (promedio < 80 || planesVencidos > 0 || enRiesgo > 0) {
    estadoSalud = { label: '🟡 En Observación', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  }

  const liderActual = todosLosEmpleados.find(e => e.id === area.lider_id);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* 1. CABECERA EJECUTIVA DEL ÁREA */}
      <div className="p-5 md:p-6 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Identidad del Área & Líder */}
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{area.nombre}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estadoSalud.badgeClass}`}>
                {estadoSalud.label}
              </span>
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
                <span className={promedio >= 80 ? 'text-emerald-600' : promedio >= 60 ? 'text-blue-600' : 'text-[#FF4C4C]'}>
                  {promedio}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    promedio >= 80 ? 'bg-emerald-500' : promedio >= 60 ? 'bg-blue-500' : 'bg-[#FF4C4C]'
                  }`}
                  style={{ width: `${promedio}%` }}
                />
              </div>
            </div>

            <div className="text-right pl-3 border-l border-slate-200">
              <span className="text-2xl font-black text-slate-800">{promedio}%</span>
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

          <div className={`p-2.5 rounded-xl border ${enRiesgo > 0 ? 'bg-red-50/80 border-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">En Riesgo (&lt;60%)</span>
            <span className={`text-sm font-black ${enRiesgo > 0 ? 'text-[#FF4C4C]' : 'text-slate-700'}`}>{enRiesgo}</span>
            <span className="text-[10px] text-slate-400 ml-1">en alerta</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${planesVencidos > 0 ? 'bg-red-50/80 border-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Compromisos</span>
            <span className="text-sm font-black text-slate-800">{planesPendientes}</span>
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
                  {todasLasAreas.filter(a => a.id !== area.id).map(a => (<option key={a.id} value={a.id}>{a.nombre}</option>))}
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
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>{estaAbierta ? 'Ocultar Colaboradores' : `Ver ${total} Colaboradores`}</span>
            <span className="text-[10px]">{estaAbierta ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* 4. LISTA DE COLABORADORES (SOLO VISIBLE SI SE EXPANDE) */}
      {estaAbierta && (
        <div className="p-5 md:p-6 bg-slate-50/50 border-t border-slate-200/80 animate-in slide-in-from-top-2">
          {empleadosArea.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {empleadosArea.map(emp => (
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
              No hay colaboradores asignados a esta área todavía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
