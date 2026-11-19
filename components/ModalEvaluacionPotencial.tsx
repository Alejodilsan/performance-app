'use client'
import { useState, useMemo } from 'react'
import type { DimensionPotencial, Empleado } from '@/lib/tipos'

export function ModalEvaluacionPotencial({ emp, onClose, onSave }: { emp: Empleado, onClose: () => void, onSave: (eid: number, score: number, nivel: 1|2|3, just: string, dim: any) => void }) {
  const dimensionesIniciales: DimensionPotencial[] = [
    { id: 'apz', nombre: 'Agilidad de Aprendizaje', descripcion: 'Velocidad para incorporar nuevos conocimientos y aplicarlos a problemas inéditos.', nota: 3, peso: 17 },
    { id: 'adt', nombre: 'Adaptabilidad', descripcion: 'Capacidad de operar con eficacia en contextos de alta ambigüedad y pivotar ante cambios.', nota: 3, peso: 17 },
    { id: 'est', nombre: 'Pensamiento Estratégico', descripcion: 'Comprensión holística del negocio, anticipación de tendencias y priorización.', nota: 3, peso: 17 },
    { id: 'res', nombre: 'Resolución de Problemas', descripcion: 'Destreza analítica para identificar causas raíz y proponer soluciones escalables.', nota: 3, peso: 17 },
    { id: 'inf', nombre: 'Influencia y Liderazgo', descripcion: 'Capacidad de persuadir y movilizar equipos sin necesidad de autoridad formal.', nota: 3, peso: 16 },
    { id: 'asp', nombre: 'Aspiración de Crecimiento', descripcion: 'Deseo de asumir mayores responsabilidades y retos de mayor envergadura.', nota: 3, peso: 16 }
  ];

  const [dimensiones, setDimensiones] = useState<DimensionPotencial[]>(dimensionesIniciales);
  const [justificacion, setJustificacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Suma total de pesos actual
  const sumaPesos = dimensiones.reduce((acc, curr) => acc + (Number(curr.peso) || 0), 0);

  // Cálculo normalizado del score ponderado (siempre entre 1.00 y 5.00)
  const scoreCalculado = useMemo(() => {
    if (sumaPesos === 0) return 0;
    const ponderado = dimensiones.reduce((acc, curr) => acc + (curr.nota * (Number(curr.peso) || 0)), 0);
    return parseFloat((ponderado / sumaPesos).toFixed(2));
  }, [dimensiones, sumaPesos]);

  let nivelCalculado: 1 | 2 | 3 = 1;
  let etiquetaNivel = 'Bajo (20-49%)';
  let colorNivel = 'text-red-600 bg-red-50 border-red-200';

  if (scoreCalculado >= 3.75) {
    nivelCalculado = 3;
    etiquetaNivel = 'Alto (75-100%)';
    colorNivel = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  } else if (scoreCalculado >= 2.50) {
    nivelCalculado = 2;
    etiquetaNivel = 'Medio (50-74%)';
    colorNivel = 'text-marca-700 bg-marca-50 border-marca-200';
  }

  // Actualización con restricción estricta de 100%
  const handleUpdate = (id: string, campo: 'nota' | 'peso', valor: number) => {
    if (campo === 'peso') {
      const otrosPesos = dimensiones
        .filter(d => d.id !== id)
        .reduce((acc, curr) => acc + (Number(curr.peso) || 0), 0);

      // El máximo que puede ingresar este campo sin que el total pase de 100%
      const maximoPermitido = Math.max(0, 100 - otrosPesos);
      const valorAjustado = Math.min(Math.max(0, valor), maximoPermitido);

      setDimensiones(prev => prev.map(d => d.id === id ? { ...d, peso: valorAjustado } : d));
    } else {
      setDimensiones(prev => prev.map(d => d.id === id ? { ...d, nota: valor } : d));
    }
  };

  // Botón para distribuir automáticamente los pesos en partes equilibradas
  const autoDistribuirPesos = () => {
    setDimensiones([
      { ...dimensiones[0], peso: 17 },
      { ...dimensiones[1], peso: 17 },
      { ...dimensiones[2], peso: 17 },
      { ...dimensiones[3], peso: 17 },
      { ...dimensiones[4], peso: 16 },
      { ...dimensiones[5], peso: 16 },
    ]);
  };

  const handleConfirmar = async () => {
    if (sumaPesos !== 100) {
      alert(`⚠️ Los pesos deben sumar exactamente 100%. Actualmente suman ${sumaPesos}% (faltan ${100 - sumaPesos}%).`);
      return;
    }
    if (justificacion.trim().length < 20) {
      alert(`⚠️ La justificación debe tener al menos 20 caracteres para respaldar la evaluación (actualmente tienes ${justificacion.trim().length}).`);
      return;
    }

    setGuardando(true);
    try {
      await onSave(emp.id, scoreCalculado, nivelCalculado, justificacion.trim(), dimensiones);
    } catch (err: any) {
      alert("Error al guardar: " + (err?.message || "Ocurrió un error inesperado"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-marca-900">Evaluación de Potencial</h2>
            <p className="text-xs text-slate-500">Colaborador: <strong className="text-slate-700">{emp.nombre}</strong></p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold hover:bg-slate-300">✕</button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar flex flex-col lg:flex-row gap-6 bg-white">
          
          {/* Lado Izquierdo: Dimensiones */}
          <div className="flex-1 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Las 6 Dimensiones</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={autoDistribuirPesos}
                  className="text-[10px] text-marca-600 hover:text-marca-800 font-bold underline"
                >
                  Distribuir 100%
                </button>
                <div className={`text-xs font-bold px-2 py-1 rounded border ${sumaPesos === 100 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  Total: {sumaPesos}% {sumaPesos !== 100 && `(Faltan ${100 - sumaPesos}%)`}
                </div>
              </div>
            </div>

            {dimensiones.map(dim => (
              <div key={dim.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-sm text-marca-900">{dim.nombre}</h4>
                    <p className="text-[10px] text-slate-500 leading-tight pr-4">{dim.descripcion}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Peso:</span>
                    <input 
                      type="number"
                      min="0"
                      max="100" 
                      className="w-14 text-xs p-1 rounded border border-slate-300 text-center font-bold text-slate-700 focus:border-slate-500 outline-none" 
                      value={dim.peso === 0 ? '' : dim.peso} 
                      onChange={e => handleUpdate(dim.id, 'peso', parseInt(e.target.value) || 0)}
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center gap-2 mt-3 bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Calificación (1 a 5):</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button 
                        key={n}
                        type="button"
                        onClick={() => handleUpdate(dim.id, 'nota', n)}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${dim.nota >= n ? 'bg-amber-400 text-white shadow-inner' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lado Derecho: Score y Justificación */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center shadow-inner ${colorNivel}`}>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Score Ponderado</span>
              <span className="text-5xl font-black mb-2">{scoreCalculado.toFixed(2)}</span>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/60 px-3 py-1 rounded-full">{etiquetaNivel}</span>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                Justificación Estratégica <span className="text-red-500">*</span>
              </label>
              <textarea 
                className="flex-1 w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 outline-none focus:border-marca-400 shadow-sm resize-none min-h-[120px]"
                placeholder="Argumenta el por qué de esta evaluación general. Explica las fortalezas demostradas y los gaps observados..."
                value={justificacion}
                onChange={e => setJustificacion(e.target.value)}
              />
              <div className="flex justify-between items-center text-[9px] mt-1 text-slate-400">
                <span>Mínimo 20 caracteres</span>
                <span className={justificacion.trim().length >= 20 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                  {justificacion.trim().length}/20
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
          <div className="text-xs">
            {sumaPesos !== 100 ? (
              <span className="text-amber-600 font-semibold">⚠️ Ajusta los pesos para sumar 100%</span>
            ) : justificacion.trim().length < 20 ? (
              <span className="text-amber-600 font-semibold">⚠️ Completa la justificación</span>
            ) : (
              <span className="text-emerald-600 font-bold">✅ Listo para guardar</span>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleConfirmar}
              disabled={guardando}
              className="px-6 py-2 text-xs font-bold text-white bg-marca-900 rounded-xl shadow-sm hover:bg-marca-800 transition-all disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Confirmar Potencial'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
