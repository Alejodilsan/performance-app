'use client'
import type { Empleado } from '@/lib/tipos'

export function MatrizNineBox({ empleados }: { empleados: Empleado[] }) {
  const cuadrantes = [
    { id: '3-1', titulo: 'Enigma', desc: 'Alto Potencial / Bajo Desempeño', color: 'bg-orange-50 border-orange-200' },
    { id: '3-2', titulo: 'Futura Estrella', desc: 'Alto Potencial / Medio Desempeño', color: 'bg-blue-50 border-blue-200' },
    { id: '3-3', titulo: 'Estrella', desc: 'Alto Potencial / Alto Desempeño', color: 'bg-green-100 border-green-300 shadow-inner' },
    { id: '2-1', titulo: 'Dilema', desc: 'Medio Potencial / Bajo Desempeño', color: 'bg-red-50 border-red-200' },
    { id: '2-2', titulo: 'Jugador Clave', desc: 'Medio Potencial / Medio Desempeño', color: 'bg-slate-50 border-slate-200' },
    { id: '2-3', titulo: 'Alto Impacto', desc: 'Medio Potencial / Alto Desempeño', color: 'bg-blue-50 border-blue-200' },
    { id: '1-1', titulo: 'Riesgo', desc: 'Bajo Potencial / Bajo Desempeño', color: 'bg-[#FFF0F0] border-[#FF4C4C]/30 shadow-inner' },
    { id: '1-2', titulo: 'Efectivo', desc: 'Bajo Potencial / Medio Desempeño', color: 'bg-orange-50 border-orange-200' },
    { id: '1-3', titulo: 'Especialista', desc: 'Bajo Potencial / Alto Desempeño', color: 'bg-slate-50 border-slate-200' },
  ];

  const obtenerNivelDesempeño = (score: number) => {
    if (score < 60) return 1;
    if (score < 85) return 2;
    return 3;
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 mt-6">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Matriz de Talento (Nine-Box)</h2>
      <p className="text-xs text-slate-500 mb-6">Clasificación automática basada en el cumplimiento de KPIs y potencial evaluado.</p>
      <div className="relative pl-8 pb-8">
        <div className="absolute left-0 top-0 bottom-8 w-8 flex flex-col justify-center items-center">
          <span className="transform -rotate-90 text-[10px] font-bold text-slate-400 tracking-widest uppercase whitespace-nowrap">Potencial (Crecimiento) ➔</span>
        </div>
        <div className="grid grid-cols-3 grid-rows-3 gap-2 h-[500px]">
          {cuadrantes.map((c) => {
            const [potencialReq, desempeñoReq] = c.id.split('-').map(Number);
            const empleadosAqui = empleados.filter(emp => {
              const pot = emp.potencial_score || 1;
              const des = obtenerNivelDesempeño(emp.cumplimiento_general || 0);
              return pot === potencialReq && des === desempeñoReq;
            });
            return (
              <div key={c.id} className={`p-3 rounded-xl border flex flex-col ${c.color} transition-all`}>
                <div className="mb-2 border-b border-black/5 pb-2">
                  <h3 className="font-bold text-slate-700 text-xs">{c.titulo}</h3>
                  <p className="text-[8px] text-slate-500 uppercase font-semibold">{c.desc}</p>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                  {empleadosAqui.map(emp => (
                    <div key={emp.id} className="bg-white p-2 rounded-lg text-xs border border-slate-100 font-medium text-slate-700 shadow-sm flex justify-between items-center">
                      <span className="truncate pr-2">{emp.nombre}</span>
                      <span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-600 font-bold">{emp.cumplimiento_general}%</span>
                    </div>
                  ))}
                  {empleadosAqui.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-40">
                      <span className="text-[10px] font-medium text-slate-400">Vacío</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute bottom-0 left-8 right-0 h-8 flex justify-center items-center">
          <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Desempeño (Score KPIs) ➔</span>
        </div>
      </div>
    </div>
  );
}
