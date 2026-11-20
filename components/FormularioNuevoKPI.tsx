'use client'
import { useState } from 'react'

export function FormularioNuevoKPI({ empId, onAdd }: { empId: number, onAdd: (eid: number, data: any) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidad, setUnidad] = useState('Cantidad');
  const [meta, setMeta] = useState('');
  const [direccion, setDireccion] = useState<'creciente' | 'decreciente'>('creciente');
  const [periodo, setPeriodo] = useState<'mensual' | 'trimestral' | 'semestral' | 'anual'>('trimestral'); // <-- Estado nuevo

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo || !meta) return alert("El título y la meta son obligatorios");
    
    onAdd(empId, {
      titulo,
      descripcion,
      unidad_medida: unidad,
      meta_esperada: parseFloat(meta) || 0,
      direccion,
      periodo // <-- Enviado al guardado
    });
    
    setTitulo(''); setDescripcion(''); setMeta(''); setAbierto(false);
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="w-full py-2 mt-2 border-2 border-dashed border-slate-200 text-slate-400 text-xs font-bold rounded-xl hover:border-slate-300 hover:text-slate-500 transition-colors">
        + Agregar Nuevo KPI
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-100 p-3 rounded-xl border border-slate-200 space-y-2 mt-2">
      <input autoFocus placeholder="Título del KPI..." className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white" value={titulo} onChange={e => setTitulo(e.target.value)} required />
      <textarea placeholder="Descripción o contexto del indicador..." className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white resize-none h-12" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
      
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Frecuencia de evaluación</label>
          <select className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white text-slate-700" value={periodo} onChange={e => setPeriodo(e.target.value as any)}>
            <option value="mensual">📅 Mensual (se evalúa cada mes)</option>
            <option value="trimestral">📊 Trimestral (mar · jun · sep · dic)</option>
            <option value="semestral">⏳ Semestral (jun · dic)</option>
            <option value="anual">🎯 Anual (dic)</option>
          </select>
          <p className="text-[9px] text-slate-400 mt-1">{periodo === 'mensual' ? 'Se califica cada mes.' : 'Cada mes se registra el avance; se evalúa en el último mes de su ventana.'}</p>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">Tipo de meta</label>
          <select className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white text-slate-700" value={direccion} onChange={e => setDireccion(e.target.value as any)}>
            <option value="creciente">📈 Creciente</option>
            <option value="decreciente">📉 Inverso</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <select className="flex-1 text-xs p-2 rounded outline-none border border-slate-200 bg-white text-slate-600" value={unidad} onChange={e => setUnidad(e.target.value)}>
          <option value="Cantidad">Cantidad (#)</option>
          <option value="%">% (Porcentaje)</option>
          <option value="$">$ (Moneda)</option>
          <option value="Días">Días</option>
        </select>
        <input type="number" placeholder="Meta" className="flex-1 text-xs p-2 rounded outline-none border border-slate-200 bg-white" value={meta} onChange={e => setMeta(e.target.value)} required />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setAbierto(false)} className="flex-1 text-[10px] font-bold text-slate-500 hover:bg-slate-200 py-1.5 rounded transition">Cancelar</button>
        <button type="submit" className="flex-1 text-[10px] font-bold text-white bg-marca-900 hover:bg-marca-800 py-1.5 rounded transition">Guardar KPI</button>
      </div>
    </form>
  );
}
