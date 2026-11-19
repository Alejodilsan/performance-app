// Marca AlemiaHR. Isotipo provisional en SVG (A + flecha de crecimiento + insignia HR) con los colores oficiales.
// Cuando estén los archivos oficiales en /public, basta con reemplazar <Isotipo> por <img src="/...svg">.

const NAVY = '#0F2942';
const VERDE = '#10B981';

interface PropsIsotipo { tamano?: number; variante?: 'color' | 'blanco'; className?: string }

export function Isotipo({ tamano = 32, variante = 'color', className }: PropsIsotipo) {
  const letra = variante === 'blanco' ? '#FFFFFF' : NAVY;
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 64 64" role="img" aria-label="AlemiaHR" className={className}>
      <defs>
        <linearGradient id={`flecha-${variante}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={variante === 'blanco' ? '#6EE7B7' : '#1E3A5A'} />
          <stop offset="0.55" stopColor={VERDE} />
          <stop offset="1" stopColor={VERDE} />
        </linearGradient>
      </defs>
      {/* A */}
      <path d="M3 58 L23 7 H34 L46 38 L38 44 L28.5 19 L14.5 58 Z" fill={letra} />
      {/* Flecha de crecimiento */}
      <path d="M8 55 C 20 44, 30 42, 40 34 C 46 29, 50 23, 53 17" fill="none" stroke={`url(#flecha-${variante})`} strokeWidth="6" strokeLinecap="round" />
      <path d="M45 13 L61 5 L57 23 Z" fill={VERDE} />
      {/* Insignia HR */}
      <rect x="37" y="40" width="25" height="17" rx="5" fill={VERDE} />
      <text x="49.5" y="52.6" textAnchor="middle" fontFamily="var(--font-montserrat), sans-serif" fontWeight="800" fontSize="11" fill="#FFFFFF">HR</text>
    </svg>
  );
}

interface PropsLogo { variante?: 'color' | 'blanco'; tamano?: 'sm' | 'md' | 'lg'; bajada?: boolean; className?: string }

/** Logo horizontal: isotipo + "AlemiaHR" (+ "Performance Platform" opcional). */
export function Logo({ variante = 'color', tamano = 'md', bajada = false, className = '' }: PropsLogo) {
  const dims = { sm: { iso: 28, texto: 'text-lg' }, md: { iso: 36, texto: 'text-xl' }, lg: { iso: 56, texto: 'text-3xl' } }[tamano];
  const blanco = variante === 'blanco';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Isotipo tamano={dims.iso} variante={variante} />
      <span className="flex flex-col leading-none">
        <span className={`font-titulo font-extrabold tracking-tight ${dims.texto} ${blanco ? 'text-white' : 'text-marca-900'}`}>
          Alemia<span className={blanco ? 'text-acento-400' : 'text-acento-500'}>HR</span>
        </span>
        {bajada && (
          <span className={`font-titulo font-semibold uppercase tracking-[0.18em] text-[9px] mt-1 ${blanco ? 'text-marca-200' : 'text-marca-600'}`}>
            Performance Platform
          </span>
        )}
      </span>
    </span>
  );
}
