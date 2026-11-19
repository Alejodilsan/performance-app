'use client'
import { useState } from 'react'
import { MOTIVOS_DESVINCULACION, type Empleado } from '@/lib/tipos'

interface Props {
  emp: Empleado;
  esLiderDe: string[]; // nombres de las áreas que lidera (se quedarán sin líder)
  onClose: () => void;
  onConfirm: (emp: Empleado, fecha: string, motivo: string) => Promise<boolean>;
}

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-acento-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

export function ModalDesvincularColaborador({ emp, esLiderDe, onClose, onConfirm }: Props) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESVINCULACION[0]);
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) { alert('Indica la fecha de desvinculación.'); return; }
    setGuardando(true);
    const motivoFinal = detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo;
    const ok = await onConfirm(emp, fecha, motivoFinal);
    setGuardando(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-marca-950/50 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={confirmar} className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-slate-100 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-marca-900">Desvincular a {emp.nombre}</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold text-xs">✕</button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
          <p>El colaborador <strong>no se elimina</strong>. Su histórico de KPIs, planes y evaluaciones se conserva y podrás reactivarlo más adelante.</p>
          <p>Dejará de aparecer en tableros, métricas, organigrama e invitaciones, y ya no podrá entrar a la plataforma.</p>
          {esLiderDe.length > 0 && (
            <p className="text-amber-700 font-semibold">⚠️ Lidera {esLiderDe.join(', ')}: esa área quedará sin líder.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha de salida *</label>
            <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Motivo *</label>
            <select className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)}>
              {MOTIVOS_DESVINCULACION.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Detalle (opcional)</label>
          <textarea className={`${inputCls} resize-none h-16`} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Comentario interno..." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Confirmar Desvinculación'}
          </button>
        </div>
      </form>
    </div>
  );
}
