'use client'
import { useState } from 'react'
import type { Area, Empleado, Puesto, TipoPerfil } from '@/lib/tipos'

export interface DatosEdicionColaborador {
  nombre: string;
  puesto_id: number;
  tipo_perfil: TipoPerfil;
  area_id: number | null;
}

interface Props {
  emp: Empleado;
  puestos: Puesto[];
  areas: Area[];
  roles: TipoPerfil[];
  onClose: () => void;
  onSave: (emp: Empleado, datos: DatosEdicionColaborador) => Promise<boolean>;
  onDesvincular: (emp: Empleado) => void;
}

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C]';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

export function ModalEditarColaborador({ emp, puestos, areas, roles, onClose, onSave, onDesvincular }: Props) {
  // Si el puesto guardado no está vinculado al catálogo, intentamos encontrarlo por nombre
  const puestoInicial = emp.puesto_id ?? puestos.find(p => p.nombre.toLowerCase() === emp.puesto?.toLowerCase())?.id;

  const [nombre, setNombre] = useState(emp.nombre);
  const [puestoId, setPuestoId] = useState<string>(puestoInicial ? String(puestoInicial) : '');
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfil>(emp.tipo_perfil || 'Empleado');
  const [areaId, setAreaId] = useState<string>(emp.area_id ? String(emp.area_id) : '');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !puestoId) {
      alert('Nombre y Puesto de trabajo son obligatorios.');
      return;
    }
    setGuardando(true);
    const ok = await onSave(emp, {
      nombre: nombre.trim(),
      puesto_id: parseInt(puestoId),
      tipo_perfil: tipoPerfil,
      area_id: areaId ? parseInt(areaId) : null,
    });
    setGuardando(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={guardar} className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-slate-100 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-800">Editar Colaborador</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold text-xs">✕</button>
        </div>

        <div>
          <label className={labelCls}>Nombre Completo *</label>
          <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} required />
        </div>

        <div>
          <label className={labelCls}>Correo Corporativo</label>
          <input className={`${inputCls} text-slate-500 cursor-not-allowed`} value={emp.email} disabled />
          <p className="text-[10px] text-slate-400 mt-1">El correo está vinculado a la cuenta de acceso y no se puede cambiar aquí.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Puesto de Trabajo *</label>
            <select className={inputCls} value={puestoId} onChange={e => setPuestoId(e.target.value)} required>
              <option value="">-- Seleccionar --</option>
              {puestos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de Perfil *</label>
            <select className={inputCls} value={tipoPerfil} onChange={e => setTipoPerfil(e.target.value as TipoPerfil)}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Área Asignada</label>
          <select className={inputCls} value={areaId} onChange={e => setAreaId(e.target.value)}>
            <option value="">-- Sin área (Pendiente) --</option>
            {areas.map(a => (
              <option key={a.id} value={a.id}>
                {a.nombre} {a.lider_id && a.lider_id !== emp.id ? '(Con líder)' : a.lider_id === emp.id ? '(Lidera)' : '(Sin líder)'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onDesvincular(emp)}
            className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl border border-red-100"
          >
            Desvincular…
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl shadow-sm disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
