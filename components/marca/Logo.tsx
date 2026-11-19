// Marca AlemiaHR (Propuesta 3, opción A). Trazos oficiales de public/marca/AlemiaHR_Logo_Principal_*.svg.
// El isotipo se dibuja inline y el texto en HTML para usar la tipografía oficial (Plus Jakarta Sans):
// un SVG cargado con <img> no puede usar fuentes web y se vería en Arial.

const NAVY = '#0F2942';
const VERDE = '#10B981';

// Recuadro de los trazos del isotipo (coordenadas del SVG oficial, sin el translate del grupo)
const ANCHO = 238, ALTO = 152, Y0 = 16;

interface PropsIsotipo { alto?: number; variante?: 'color' | 'blanco'; className?: string }

/** Isotipo: A + flecha de crecimiento. En blanco, todo blanco (versión oficial para fondos oscuros). */
export function Isotipo({ alto = 32, variante = 'color', className }: PropsIsotipo) {
  const base = variante === 'blanco' ? '#FFFFFF' : NAVY;
  const acento = variante === 'blanco' ? '#FFFFFF' : VERDE;
  return (
    <svg height={alto} width={(alto * ANCHO) / ALTO} viewBox={`0 ${Y0} ${ANCHO} ${ALTO}`} role="img" aria-label="AlemiaHR" className={className}>
      <path d="M 16 126 L 56 44 C 60 36, 70 36, 74 44 L 114 128 C 120 140, 132 140, 138 128 L 154 78 L 166 96 L 146 144 C 134 166, 110 166, 98 144 L 65 72 L 32 138 Z" fill={base} />
      <path d="M 2 162 C 18 124, 46 112, 78 104 C 110 96, 134 76, 152 44 C 156 37, 165 37, 168 44 L 160 66 C 142 96, 116 114, 82 122 C 52 129, 32 140, 22 162 Z" fill={base} />
      <path d="M 164 42 C 168 42, 172 45, 174 52 L 204 156 L 182 156 L 161 78 L 154 64 Z" fill={acento} />
      <path d="M 110 134 C 134 102, 162 72, 192 44 L 176 34 L 234 20 L 214 78 L 202 62 C 172 90, 146 118, 124 146 C 118 144, 113 140, 110 134 Z" fill={acento} />
    </svg>
  );
}

interface PropsLogo { variante?: 'color' | 'blanco'; tamano?: 'sm' | 'md' | 'lg'; bajada?: boolean; className?: string }

// Proporciones del logo oficial: texto 76px, insignia HR 64px de alto (≈0,84), isotipo ≈1,9 veces el texto
const TAMANOS = {
  sm: { texto: 20, iso: 34 },
  md: { texto: 26, iso: 44 },
  lg: { texto: 36, iso: 62 },
};

/** Logo horizontal oficial: isotipo + "Alemia" + insignia HR (+ "PERFORMANCE PLATFORM" opcional). */
export function Logo({ variante = 'color', tamano = 'md', bajada = false, className = '' }: PropsLogo) {
  const t = TAMANOS[tamano];
  const blanco = variante === 'blanco';
  const insignia = Math.round(t.texto * 0.84);
  return (
    <span className={`inline-flex items-center gap-[0.55em] ${className}`} style={{ fontSize: t.texto }}>
      <Isotipo alto={t.iso} variante={variante} />
      <span className="flex flex-col leading-none">
        <span className="flex items-center gap-[0.22em]">
          <span className={`font-marca font-bold tracking-[-0.02em] ${blanco ? 'text-white' : 'text-marca-900'}`}>Alemia</span>
          <span
            className={`font-marca font-extrabold inline-flex items-center justify-center rounded-[0.2em] px-[0.28em] ${blanco ? 'text-white border-2 border-white' : 'bg-acento-500 text-white'}`}
            style={{ height: insignia, fontSize: t.texto * 0.58 }}
          >
            HR
          </span>
        </span>
        {bajada && (
          <span className={`font-semibold uppercase tracking-[0.28em] mt-[0.35em] ${blanco ? 'text-white/85' : 'text-marca-900'}`} style={{ fontSize: Math.max(8, t.texto * 0.21) }}>
            Performance Platform
          </span>
        )}
      </span>
    </span>
  );
}
