'use client'
// Piezas visuales de crecimiento: anillo de progreso, mensaje motivador y logros.
import type { Logro, MensajeProgreso } from '@/lib/motivacion'
import { useUmbrales } from '@/lib/umbrales'

/** Anillo de progreso: verde si alcanza el nivel alto, azul en avance, ámbar como oportunidad. */
export function AnilloProgreso({ valor, tamano = 132, grosor = 12, etiqueta }: { valor: number; tamano?: number; grosor?: number; etiqueta?: string }) {
  const u = useUmbrales();
  const v = Math.max(0, Math.min(100, Math.round(valor || 0)));
  const r = (tamano - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const color = v >= u.umbral_desempeno_alto ? 'text-acento-500' : v >= u.umbral_desempeno_bajo ? 'text-marca-500' : 'text-amber-500';
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }} role="img" aria-label={`${etiqueta || 'Cumplimiento'}: ${v}%`}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" strokeWidth={grosor} className="stroke-marca-50" />
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" strokeWidth={grosor} strokeLinecap="round"
          className={`stroke-current ${color} transition-[stroke-dashoffset] duration-1000`}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-titulo text-3xl font-extrabold text-marca-900 leading-none">{v}%</span>
        {etiqueta && <span className="text-[10px] font-semibold uppercase tracking-wider text-marca-400 mt-1">{etiqueta}</span>}
      </div>
    </div>
  );
}

const TONO: Record<MensajeProgreso['tono'], string> = {
  logro: 'from-acento-500 to-acento-700',
  avance: 'from-marca-700 to-marca-900',
  impulso: 'from-marca-800 to-marca-950',
  inicio: 'from-marca-700 to-marca-900',
};

/** Banda con el mensaje de progreso y la flecha de crecimiento de la marca de fondo. */
export function BandaProgreso({ mensaje }: { mensaje: MensajeProgreso }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${TONO[mensaje.tono]} p-6 md:p-7 text-white`}>
      <FlechaCrecimiento className="absolute -right-6 -bottom-8 w-56 h-56 text-white/10" />
      <div className="relative max-w-2xl">
        <h2 className="text-xl md:text-2xl font-extrabold">{mensaje.titulo}</h2>
        <p className="text-sm md:text-[15px] text-white/85 mt-1.5 leading-relaxed">{mensaje.texto}</p>
      </div>
    </div>
  );
}

export function FlechaCrecimiento({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M8 88 C 30 70, 50 66, 66 48 C 74 39, 80 30, 84 20" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <path d="M70 16 L96 4 L90 32 Z" fill="currentColor" />
    </svg>
  );
}

/** Insignias de logros (metas al 100% y compromisos cumplidos). */
export function Logros({ logros }: { logros: Logro[] }) {
  return (
    <div className="bg-white p-6 md:p-7 rounded-3xl shadow-sm border border-marca-100">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-marca-900">🏅 Mis logros</h3>
          <p className="text-xs text-marca-400">Metas cumplidas y compromisos de desarrollo cerrados.</p>
        </div>
        {logros.length > 0 && <span className="font-titulo text-2xl font-extrabold text-acento-600">{logros.length}</span>}
      </div>
      {logros.length === 0 ? (
        <p className="text-sm text-marca-500 bg-marca-50 rounded-2xl p-4">
          Tu primer logro está cerca: lleva una meta al 100% o cierra un compromiso de tu plan de mejora. 🌱
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {logros.map((l, i) => (
            <li key={i} className="flex items-start gap-3 p-3 rounded-2xl border border-acento-100 bg-gradient-to-br from-acento-50 to-white">
              <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg text-white shadow-sm ${l.tipo === 'meta' ? 'bg-gradient-to-br from-acento-400 to-acento-600' : 'bg-gradient-to-br from-marca-500 to-marca-800'}`} aria-hidden>
                {l.tipo === 'meta' ? '🎯' : '✅'}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-acento-700">{l.titulo}</span>
                <span className="block text-sm font-semibold text-marca-900 leading-snug line-clamp-2" title={l.detalle}>{l.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
