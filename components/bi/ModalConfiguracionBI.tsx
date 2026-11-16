'use client'
import { useState } from 'react'
import { MONEDAS } from '@/lib/tipos'
import { validarConfiguracion, type ConfiguracionBI } from '@/lib/bi'
import { guardarConfiguracionBI } from '@/lib/biApi'
import { mensajeDeError } from '@/lib/errores'

interface Props { config: ConfiguracionBI; onClose: () => void; onGuardada: (c: ConfiguracionBI) => void }

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C]';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

export function ModalConfiguracionBI({ config, onClose, onGuardada }: Props) {
  const [c, setC] = useState(config);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof ConfiguracionBI>(k: K, v: ConfiguracionBI[K]) => setC(prev => ({ ...prev, [k]: v }));
  const error = validarConfiguracion(c);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (error) return;
    setGuardando(true);
    try { await guardarConfiguracionBI(c); onGuardada(c); onClose(); }
    catch (err) { alert(mensajeDeError(err)); }
    finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={guardar} className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-slate-100 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">⚙️ Configuración del BI</h3>
            <p className="text-[11px] text-slate-500">Aplica a toda la organización.</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold text-xs">✕</button>
        </div>

        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Costo de nómina</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Moneda principal</label>
            <select className={inputCls} value={c.moneda_principal} onChange={e => set('moneda_principal', e.target.value)}>
              {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Factor prestacional</label>
            <input type="number" step="0.01" min={1} max={3} className={inputCls} value={c.factor_prestacional} onChange={e => set('factor_prestacional', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Horas / mes</label>
            <input type="number" step="1" min={1} max={400} className={inputCls} value={c.horas_mes} onChange={e => set('horas_mes', Number(e.target.value))} />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 -mt-2">
          Costo empresa = salario base mensual × factor (p. ej. 1,52 incluye prestaciones, seguridad social y parafiscales).
          Las horas/mes convierten los salarios por hora. Salarios en otra moneda se reportan aparte, sin convertir.
        </p>

        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 pt-2">Umbrales de desempeño</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Bajo si es menor a (%)</label>
            <input type="number" min={1} max={99} className={inputCls} value={c.umbral_desempeno_bajo} onChange={e => set('umbral_desempeno_bajo', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Alto desde (%)</label>
            <input type="number" min={2} max={100} className={inputCls} value={c.umbral_desempeno_alto} onChange={e => set('umbral_desempeno_alto', Number(e.target.value))} />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 -mt-2">Se usan en el Nine Box, el tablero y las tarjetas de toda la plataforma.</p>

        {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button type="submit" disabled={guardando || !!error} className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
