'use client'
import { etiquetaPotencial } from '@/lib/motivacion'
import { AreaChart, Area as RechartsArea, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Empleado } from '@/lib/tipos'
import { useUmbrales } from '@/lib/umbrales'
import { HistorialEmpleado } from './HistorialEmpleado'

export function ModalPerfilColaborador({ emp, onClose }: { emp: Empleado, onClose: () => void }) {
  const { umbral_desempeno_alto: meta } = useUmbrales();
  const historicoOrdenado = [...(emp.historico || [])].sort(
    (a, b) => new Date(a.fecha_corte).getTime() - new Date(b.fecha_corte).getTime()
  );
  const variacion = historicoOrdenado.length >= 2 
    ? Number((historicoOrdenado[historicoOrdenado.length - 1].cumplimiento - historicoOrdenado[historicoOrdenado.length - 2].cumplimiento).toFixed(1)) 
    : null;
    const mediaHistorica = historicoOrdenado.length > 0
    ? Math.round(historicoOrdenado.reduce((acc, curr) => acc + curr.cumplimiento, 0) / historicoOrdenado.length)
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-marca-950/60 backdrop-blur-sm p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-fondo w-full max-w-5xl h-full max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Cabecera del Visor */}
        <div className="px-6 md:px-8 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm">
              {emp.nombre.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-marca-900 leading-tight">{emp.nombre}</h2>
              <p className="text-xs text-slate-500 font-medium">{emp.puesto}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 flex items-center justify-center transition">✕</button>
        </div>

        {/* Cuerpo Analítico */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
               <span className="text-[10px] font-black uppercase tracking-widest text-acento-700 block mb-1">Descripción del Cargo</span>
               <p className="text-sm text-slate-600 italic">{emp.job_descripcion || "No hay una descripción registrada."}</p>
            </div>
            
            <div className="bg-acento-50 p-6 rounded-3xl border border-acento-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Cumplimiento</span>
                <span className="text-[10px] font-bold text-slate-500 block mt-1">Potencial: {etiquetaPotencial(emp.potencial_score)}</span>
              </div>
              <div className="text-right">
                <h3 className="text-5xl font-black text-acento-700">{emp.cumplimiento_general}%</h3>
                {variacion !== null && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full mt-1 inline-block ${variacion >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {variacion >= 0 ? `▲ +${variacion}%` : `▼ ${variacion}%`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-marca-900 mb-4">📈 Evolución Histórica</h3>
            {historicoOrdenado.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicoOrdenado} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCurvaAzul" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }} />
                    <ReferenceLine 
                      y={meta} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      label={{ value: `Meta ${meta}%`, position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} 
                    />
                    {mediaHistorica > 0 && (
                      <ReferenceLine 
                        y={mediaHistorica} 
                        stroke="#f59e0b" 
                        strokeDasharray="4 4" 
                        label={{ value: `Media: ${mediaHistorica}%`, position: 'insideTopLeft', fill: '#d97706', fontSize: 10, fontWeight: 'bold' }} 
                      />
                    )}
                    <RechartsArea type="monotone" dataKey="cumplimiento" stroke="#10B981" strokeWidth={3} fill="url(#colorCurvaAzul)" dot={{ fill: '#10B981', r: 4 }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">Aún no hay cortes históricos para este colaborador.</p>
            )}
          </div>

          <HistorialEmpleado empleadoId={emp.id} fechaIngreso={emp.fecha_ingreso} />
        </div>
      </div>
    </div>
  );
}
