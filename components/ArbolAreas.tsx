'use client'
import { useState, type ReactNode } from 'react'
import type { NodoArea } from '@/lib/jerarquia'

interface Props {
  nodos: NodoArea[];
  renderArea: (nodo: NodoArea) => ReactNode;
  /** Mientras se busca, todas las ramas se muestran abiertas */
  forzarAbiertas?: boolean;
}

// Muestra las áreas como árbol: cada sub-área va debajo de su área padre, con sangría y línea guía.
export function ArbolAreas({ nodos, renderArea, forzarAbiertas = false }: Props) {
  const [plegadas, setPlegadas] = useState<Set<number>>(new Set());

  const togglePlegada = (id: number) =>
    setPlegadas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });

  const renderRama = (nodo: NodoArea): ReactNode => {
    const tieneHijos = nodo.hijos.length > 0;
    const abierta = forzarAbiertas || !plegadas.has(nodo.area.id);

    return (
      <div key={nodo.area.id}>
        {renderArea(nodo)}

        {tieneHijos && (
          <div className="ml-5 md:ml-8">
            <button
              type="button"
              onClick={() => togglePlegada(nodo.area.id)}
              disabled={forzarAbiertas}
              className="flex items-center gap-2 pl-4 md:pl-6 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 border-l-2 border-slate-200 disabled:cursor-default"
            >
              <span className="text-[9px] w-3">{abierta ? '▼' : '▶'}</span>
              <span>
                {nodo.hijos.length} sub-área{nodo.hijos.length === 1 ? '' : 's'} de{' '}
                <span className="text-slate-700">{nodo.area.nombre}</span>
              </span>
            </button>

            {abierta && (
              <div className="border-l-2 border-slate-200 pl-4 md:pl-6 space-y-4 pb-1">
                {nodo.hijos.map(hijo => (
                  <div key={hijo.area.id} className="relative">
                    {/* Conector horizontal desde la línea guía hasta la tarjeta */}
                    <span className="absolute -left-4 md:-left-6 top-9 w-4 md:w-6 h-0.5 bg-slate-200" aria-hidden />
                    {renderRama(hijo)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return <div className="space-y-6">{nodos.map(renderRama)}</div>;
}
