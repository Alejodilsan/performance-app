'use client'
import { useState } from 'react'
import type { Area, Empleado, FuncionesTarjeta } from '@/lib/tipos'
import { ETIQUETA_ESTADO_ACCESO } from '@/lib/accesos'
import { FormularioNuevoKPI } from './FormularioNuevoKPI'
import { ModalEvaluacionPotencial } from './ModalEvaluacionPotencial'

interface PropsTarjeta {
  emp: Empleado;
  esLider: boolean;
  areas: Area[];
  allowEdit: boolean;
  funciones: FuncionesTarjeta;
}

export function TarjetaEmpleado({ emp, esLider, areas, allowEdit, funciones }: PropsTarjeta) {
  const {
    asignarAreaEmpleado, actualizarIndicador, agregarIndicador,
    crearPlan, completarPlan, setExpandidoId, expandidoId,
    textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes,
    calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario,
    nuevosComentarios, setNuevosComentarios
  } = funciones;

  const estaExpandido = expandidoId === emp.id;
  const planesActivos = emp.planes_mejora?.filter(p => p.estado !== 'completado') || [];
  const planesVencidos = planesActivos.filter(p => calcularGantt(p.created_at, p.fecha_limite).esVencido);
  const colorDesempeno = emp.cumplimiento_general >= 85 ? 'text-emerald-600' : emp.cumplimiento_general >= 70 ? 'text-blue-600' : 'text-[#FF4C4C]';
  const barBg = emp.cumplimiento_general >= 85 ? 'bg-emerald-500' : emp.cumplimiento_general >= 70 ? 'bg-blue-600' : 'bg-[#FF4C4C]';
  const [modalPotencialAbierto, setModalPotencialAbierto] = useState(false);

  // --- FILTRO Y CÁLCULO POR PERIODO ---
  const [periodoFiltro, setPeriodoFiltro] = useState<'todos' | 'mensual' | 'trimestral' | 'semestral' | 'anual'>('todos');

  const indicadoresFiltrados = emp.indicadores?.filter(i => 
    periodoFiltro === 'todos' ? true : (i.periodo || 'trimestral') === periodoFiltro
  ) || [];

  const cumplimientoPeriodo = indicadoresFiltrados.length > 0 
    ? Math.round(indicadoresFiltrados.reduce((acc, curr) => acc + curr.progreso, 0) / indicadoresFiltrados.length)
    : 0;

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-lg ${
      esLider ? 'border-amber-200/80 shadow-amber-50/50' : 'border-slate-100'
    } shadow-sm overflow-hidden flex flex-col justify-between`}>
      
      {/* 1. VISTA ESTRATÉGICA (SIEMPRE VISIBLE) */}
      <div className="p-5">
        
        {/* Cabecera: Avatar, Nombre, Rol, Icono de Descripción y Score */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
              esLider ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
            }`}>
              {emp.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base truncate" title={emp.nombre}>
                  {emp.nombre}
                </h3>
                {esLider && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200/60 font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                    Líder
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-slate-500 truncate font-medium">{emp.puesto}</p>
                {emp.job_descripcion && (
                  <span title={emp.job_descripcion} className="cursor-help text-xs text-slate-400 hover:text-slate-600">ℹ️</span>
                )}
              </div>
              {/* Estado de acceso a la plataforma: solo lo ve el Admin */}
              {funciones.editarColaborador && (() => {
                const estado = ETIQUETA_ESTADO_ACCESO[emp.estado_acceso || 'sin_invitar'];
                return (
                  <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${estado.clase}`} title="Estado de acceso a la plataforma">
                    🔑 {estado.texto}
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end">
            <span className={`text-2xl font-black tracking-tight leading-none ${colorDesempeno}`}>
              {emp.cumplimiento_general}%
            </span>
            <span className="block text-[9px] uppercase font-bold text-slate-400 mt-0.5 mb-2">Score</span>
            <button
              type="button"
              onClick={() => funciones.verPerfilCompleto?.(emp)}
              className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1 border border-blue-100"
            >
              👁️ Ver Curva
            </button>
            {(funciones.editarColaborador || funciones.desvincularColaborador) && (
              <div className="flex items-center gap-1 mt-1.5">
                {funciones.editarColaborador && (
                  <button
                    type="button"
                    onClick={() => funciones.editarColaborador?.(emp)}
                    title="Editar datos del colaborador"
                    className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg hover:bg-slate-100 border border-slate-200"
                  >
                    ✏️ Editar
                  </button>
                )}
                {funciones.desvincularColaborador && (
                  <button
                    type="button"
                    onClick={() => funciones.desvincularColaborador?.(emp)}
                    title="Desvincular (conserva el histórico)"
                    className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg hover:bg-red-100 border border-red-100"
                  >
                    Baja
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Barra de Progreso Minimalista */}
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all duration-700 ${barBg}`} style={{ width: `${emp.cumplimiento_general}%` }}></div>
        </div>

        {/* Chips de Diagnóstico Rápido */}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          {/* Potencial Nine-Box Robusto */}
          {allowEdit ? (
            <button
              type="button"
              onClick={() => setModalPotencialAbierto(true)}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-[11px] font-semibold text-slate-700 py-1 px-2.5 transition-colors flex items-center gap-1.5"
              title="Evaluar Potencial"
            >
              {emp.potencial_score === 3 ? '⭐ Alto Potencial' : emp.potencial_score === 2 ? '🚀 Medio' : '🌱 Bajo'}
              <span className="text-[9px] text-slate-400 ml-1">✏️</span>
            </button>
          ) : (
            <span className="bg-slate-50 text-slate-600 border border-slate-200/60 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
              {emp.potencial_score === 3 ? '⭐ Alto Potencial' : emp.potencial_score === 2 ? '🚀 Medio' : '🌱 Bajo'}
            </span>
          )}

          {/* Estado de Acciones */}
          <div className="flex items-center gap-1.5">
            {planesVencidos.length > 0 ? (
              <span className="text-[11px] bg-red-50 text-red-600 border border-red-100 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                <span>⚠️</span> {planesVencidos.length} Vencido{planesVencidos.length > 1 ? 's' : ''}
              </span>
            ) : planesActivos.length > 0 ? (
              <span className="text-[11px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-lg">
                🚀 {planesActivos.length} Plan{planesActivos.length > 1 ? 'es' : ''}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">
                Sin alertas
              </span>
            )}

            <span className="text-[11px] bg-slate-50 text-slate-500 font-medium px-2 py-0.5 rounded-lg border border-slate-100">
              📊 {emp.indicadores?.length || 0} KPIs
            </span>
          </div>
        </div>

      </div>

      {/* 2. BOTÓN DE APERTURA OPERATIVA */}
      <div className="border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={() => setExpandidoId(estaExpandido ? null : emp.id)}
          className={`w-full py-2.5 text-center text-[11px] font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 ${
            estaExpandido
              ? 'text-slate-600 bg-slate-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
          }`}
        >
          <span>{estaExpandido ? 'Cerrar detalle' : 'Gestionar KPIs y Planes'}</span>
          <span className="text-[9px]">{estaExpandido ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* 3. VISTA OPERATIVA DETALLADA (SOLO AL DESPLEGAR) */}
      {estaExpandido && (
        <div className="border-t border-slate-200/80 bg-slate-50/70 p-5 space-y-5 animate-in slide-in-from-top-2">
          
          {/* Descripción del Cargo */}
          {allowEdit && (
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Descripción del Cargo / Responsabilidades</label>
              <textarea
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-slate-400 shadow-sm resize-none h-16"
                placeholder="Describe las principales responsabilidades de este puesto..."
                defaultValue={emp.job_descripcion || ''}
                onBlur={(e) => funciones.actualizarDescripcionPuesto?.(emp.id, e.target.value)}
              />
            </div>
          )}

          {/* Reasignar Área */}
          {allowEdit && (
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mover de Área</label>
              <select
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-slate-400 shadow-sm"
                value={emp.area_id || ""}
                onChange={(e) => asignarAreaEmpleado(emp.id, e.target.value)}
              >
                <option value="">-- Sin Área Asignada --</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          )}

          {/* Sección de Indicadores (KPIs) con Pestañas y Filtro */}
          <div>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Indicadores Clave</span>
                <span className="text-xs font-bold text-slate-700">
                  Score {periodoFiltro !== 'todos' ? `(${periodoFiltro})` : ''}: <span className="text-[#FF4C4C]">{cumplimientoPeriodo}%</span>
                </span>
              </div>

              {/* Selector de periodo */}
              <div className="flex gap-1 bg-slate-200/60 p-1 rounded-lg text-[10px] font-bold text-slate-600">
                {(['todos', 'mensual', 'trimestral', 'semestral', 'anual'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodoFiltro(p)}
                    className={`flex-1 py-1 rounded capitalize transition-all ${
                      periodoFiltro === p ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 mb-3">
              {indicadoresFiltrados.map((ind) => (
                <div key={ind.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                  
                  {allowEdit && (
                    <button 
                      type="button"
                      onClick={() => funciones.eliminarIndicador(ind.id)}
                      className="absolute top-2 right-2 text-red-300 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors text-xs font-bold"
                      title="Eliminar KPI"
                    >
                      🗑️ Borrar
                    </button>
                  )}

                  <div className="pr-16">
                    <div className="flex justify-between items-center mb-1 font-semibold text-slate-700">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-sm">{ind.titulo}</span>
                        <span className="text-[10px] text-slate-400 capitalize">({ind.periodo || 'trimestral'})</span>
                      </div>
                      <span className={`text-lg ml-2 ${ind.progreso < 70 ? 'text-[#FF4C4C] font-black' : 'text-slate-800 font-black'}`}>
                        {ind.progreso || 0}%
                      </span>
                    </div>
                    {ind.descripcion && <p className="text-[11px] text-slate-500 mb-3 leading-tight border-b border-slate-100 pb-2">{ind.descripcion}</p>}
                  </div>
                  
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Meta a lograr:</span>
                      <span className="text-sm font-bold text-slate-800">{ind.meta_esperada || 0} <span className="text-xs font-normal text-slate-500">{ind.unidad_medida || 'Und.'}</span></span>
                    </div>
                    
                    <div className="w-px h-8 bg-slate-200 mx-2"></div>
                    
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Resultado actual:</span>
                      {allowEdit ? (
                        <div className="flex items-center gap-2">
                           <input
                              type="number"
                              className="w-20 p-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#FF4C4C] outline-none text-slate-800 font-bold"
                              value={ind.resultado_actual === 0 ? '' : ind.resultado_actual}
                              placeholder="0"
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                actualizarIndicador(ind.id, isNaN(val) ? 0 : val, emp.id);
                              }}
                           />
                           <span className="text-xs text-slate-500">{ind.unidad_medida}</span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-slate-800">{ind.resultado_actual || 0} <span className="text-xs font-normal text-slate-500">{ind.unidad_medida}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden mt-3 w-full">
                     <div className={`h-full rounded-full ${ind.progreso >= 100 ? 'bg-emerald-500' : ind.progreso >= 70 ? 'bg-blue-500' : 'bg-[#FF4C4C]'}`} style={{ width: `${ind.progreso || 0}%` }}></div>
                  </div>

                  {/* Feedback Continuo del Líder */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Feedback del proceso (Líder)</label>
                    {allowEdit ? (
                      <textarea
                        className="w-full text-[10px] bg-slate-50/50 border border-slate-200 rounded p-2 text-slate-600 outline-none focus:border-slate-400 resize-none min-h-[40px]"
                        placeholder="Añade observaciones sobre el avance de este KPI..."
                        defaultValue={ind.feedback_lider || ''}
                        onBlur={(e) => {
                          if (e.target.value !== ind.feedback_lider) {
                            funciones.guardarFeedbackKPI?.(ind.id, emp.id, e.target.value);
                          }
                        }}
                      />
                    ) : (
                      <p className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 italic">
                        {ind.feedback_lider || "Aún no hay retroalimentación registrada."}
                      </p>
                    )}
                    {ind.fecha_feedback && (
                      <p className="text-[8px] text-slate-400 mt-1 text-right">Última rev: {new Date(ind.fecha_feedback).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
              ))}

              {indicadoresFiltrados.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">
                  No hay indicadores registrados para el periodo seleccionado.
                </p>
              )}
            </div>

            {allowEdit && (
              <FormularioNuevoKPI empId={emp.id} onAdd={agregarIndicador} />
            )}
          </div>

          {/* Sección de Action Plans */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">Planes de Mejora</span>
            
            {emp.planes_mejora && emp.planes_mejora.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {emp.planes_mejora.map((plan) => {
                  const gantt = calcularGantt(plan.created_at, plan.fecha_limite);
                  return (
                    <div key={plan.id} className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className={`text-xs font-semibold truncate w-[60%] ${plan.estado === 'completado' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {plan.compromiso}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setPlanChatAbierto(planChatAbierto === plan.id ? null : plan.id)}
                            className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            💬 {plan.comentarios?.length || 0}
                          </button>
                          {allowEdit && (
                            <button
                              type="button"
                              onClick={() => completarPlan(plan.id, plan.estado)}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                                plan.estado === 'completado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                            >
                              {plan.estado === 'completado' ? 'Listo' : 'OK'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                        <span>Inicio: {gantt.fechaInicioStr}</span>
                        <span className={gantt.esVencido && plan.estado !== 'completado' ? 'text-red-500 font-bold' : ''}>
                          {plan.estado === 'completado' ? 'Completado' : (gantt.esVencido ? 'Vencido' : `Meta: ${gantt.fechaFinStr}`)}
                        </span>
                      </div>

                      {/* Chat de comentarios */}
                      {planChatAbierto === plan.id && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100">
                          <div className="max-h-24 overflow-y-auto space-y-1.5 mb-2 custom-scrollbar">
                            {plan.comentarios?.map(c => (
                              <div key={c.id} className="text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                                <strong className="text-slate-700">{c.autor}: </strong>
                                <span className="text-slate-600">{c.texto}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              className="flex-1 text-[10px] border border-slate-200 rounded p-1.5 outline-none"
                              placeholder="Comentario..."
                              value={nuevosComentarios[plan.id] || ''}
                              onChange={e => setNuevosComentarios({ ...nuevosComentarios, [plan.id]: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') enviarComentario(plan.id); }}
                            />
                            <button
                              type="button"
                              onClick={() => enviarComentario(plan.id)}
                              className="bg-slate-800 text-white px-2.5 rounded text-[10px] font-bold"
                            >
                              Enviar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-2">Sin compromisos asignados.</p>
            )}

            {/* Asignar nuevo compromiso */}
            {allowEdit && (
              <div className="mt-3 flex gap-1.5">
                <input
                  className="flex-1 text-xs border border-slate-200 bg-white p-2 rounded-lg outline-none focus:border-slate-400"
                  placeholder="Asignar compromiso..."
                  value={textosPlanes[emp.id] || ''}
                  onChange={e => setTextosPlanes({ ...textosPlanes, [emp.id]: e.target.value })}
                />
                <select
                  className="text-xs border border-slate-200 bg-white text-slate-700 rounded-lg px-2 outline-none"
                  value={diasPlanes[emp.id] || 7}
                  onChange={e => setDiasPlanes({ ...diasPlanes, [emp.id]: parseInt(e.target.value) })}
                >
                  <option value={3}>3d</option>
                  <option value={7}>7d</option>
                  <option value={15}>15d</option>
                  <option value={30}>30d</option>
                </select>
                <button
                  type="button"
                  onClick={() => crearPlan(emp.id)}
                  className="bg-slate-800 text-white px-3 rounded-lg font-bold hover:bg-slate-900 transition-colors"
                >
                  +
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL DE EVALUACIÓN DE POTENCIAL */}
      {modalPotencialAbierto && (
        <ModalEvaluacionPotencial 
          emp={emp} 
          onClose={() => setModalPotencialAbierto(false)} 
          onSave={(eid, score, nivel, just, dim) => {
            funciones.guardarEvaluacionPotencial?.(eid, score, nivel, just, dim);
            setModalPotencialAbierto(false);
          }} 
        />
      )}

    </div>
  );
}
