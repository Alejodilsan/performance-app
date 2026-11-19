// Marco de las pantallas de acceso (login, crear y actualizar contraseña): marca a la izquierda, formulario a la derecha.
import type { ReactNode } from 'react'
import { Logo } from './Logo'
import { FlechaCrecimiento } from './Crecimiento'

const PILARES = [
  { icono: '🎯', texto: 'Metas claras y medibles para cada persona' },
  { icono: '📈', texto: 'Tu progreso visible, período a período' },
  { icono: '🌱', texto: 'Planes de desarrollo y logros reconocidos' },
];

export function MarcoAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-fondo grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <section className="relative overflow-hidden bg-gradient-to-br from-marca-800 via-marca-900 to-marca-950 text-white px-8 py-10 lg:px-14 lg:py-14 flex flex-col">
        <FlechaCrecimiento className="absolute -right-16 -bottom-16 w-[420px] h-[420px] text-acento-500/15" />
        <div className="absolute -left-24 -top-24 w-72 h-72 rounded-full bg-acento-500/10 blur-3xl" aria-hidden />
        <Logo variante="blanco" tamano="lg" bajada />
        <div className="relative mt-10 lg:mt-auto max-w-md">
          <h2 className="text-3xl lg:text-4xl font-extrabold leading-tight">
            Impulsa el <span className="text-acento-400">crecimiento</span> de tu gente.
          </h2>
          <p className="text-marca-200 mt-3 text-sm lg:text-base">
            Desempeño, desarrollo y talento en un solo lugar, para que cada persona sepa dónde está y hacia dónde va.
          </p>
          <ul className="hidden sm:block mt-8 space-y-3">
            {PILARES.map(p => (
              <li key={p.texto} className="flex items-center gap-3 text-sm text-marca-100">
                <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center" aria-hidden>{p.icono}</span>
                {p.texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden lg:block mt-10 text-[11px] text-marca-300">© {new Date().getFullYear()} AlemiaHR</p>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-[0_20px_60px_-20px_rgba(15,41,66,0.25)] border border-marca-100 animate-in fade-in zoom-in-95">
          {children}
        </div>
      </section>
    </main>
  );
}
