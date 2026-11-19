'use client'

// Botón del menú lateral (fondo azul profundo). El activo se marca en verde esmeralda.
export function BotonLateral({ icono, texto, activo, onClick, visible = true }: { icono: string, texto: string, activo: boolean, onClick: () => void, visible?: boolean }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? 'page' : undefined}
      className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
        activo
          ? 'bg-white/10 text-white font-semibold'
          : 'text-marca-200 font-medium hover:bg-white/5 hover:text-white'
      }`}
    >
      {activo && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-acento-400" aria-hidden />}
      <span className="text-lg w-6 text-center">{icono}</span>
      <span>{texto}</span>
    </button>
  );
}
