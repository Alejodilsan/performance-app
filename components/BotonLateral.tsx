'use client'


// Botón Lateral del Menú
export function BotonLateral({ icono, texto, activo, onClick, visible = true }: { icono: string, texto: string, activo: boolean, onClick: () => void, visible?: boolean }) {
  if (!visible) return null;
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        activo 
          ? 'bg-[#FFF0F0] text-[#FF4C4C] font-bold shadow-sm' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span className="text-lg w-6 text-center">{icono}</span>
      <span>{texto}</span>
    </button>
  );
}
