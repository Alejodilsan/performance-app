'use client'
// Buscador del encabezado: resultados desplegables (personas y áreas) con la coincidencia resaltada.
// Teclado: "/" enfoca · ↑↓ recorre · Enter elige · Esc cierra.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Area, Empleado } from '@/lib/tipos'
import { buscar, resaltar, type ResultadoBusqueda } from '@/lib/busqueda'

interface Props {
  valor: string;
  onCambiar: (v: string) => void;
  empleados: Empleado[];
  areas: Area[];
  onElegirPersona: (emp: Empleado) => void;
  onElegirArea: (area: Area) => void;
  /** Aplica la búsqueda como filtro del árbol por áreas */
  onVerTodos: () => void;
}

export function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  return (
    <>
      {resaltar(texto, consulta).map((s, i) => s.coincide
        ? <mark key={i} className="bg-amber-200/80 text-marca-950 rounded-[3px] px-[1px]">{s.texto}</mark>
        : <span key={i}>{s.texto}</span>)}
    </>
  );
}

const CAMPO = { nombre: '', email: 'correo', puesto: 'cargo', perfil: 'perfil' } as const;

export function BuscadorGlobal({ valor, onCambiar, empleados, areas, onElegirPersona, onElegirArea, onVerTodos }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const r = useMemo(() => buscar(valor, empleados, areas), [valor, empleados, areas]);
  const lista: ResultadoBusqueda[] = [...r.personas, ...r.areas];
  const nombreArea = (id: number | null) => areas.find(a => a.id === id)?.nombre;
  const indiceActivo = Math.min(activo, Math.max(lista.length - 1, 0));

  // "/" enfoca el buscador (si no se está escribiendo en otro campo)
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  function elegir(item: ResultadoBusqueda | undefined) {
    if (!item) return;
    setAbierto(false);
    inputRef.current?.blur();
    if (item.tipo === 'persona') onElegirPersona(item.emp); else onElegirArea(item.area);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { if (abierto && valor) setAbierto(false); else onCambiar(''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo((indiceActivo + 1) % Math.max(lista.length, 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((indiceActivo - 1 + lista.length) % Math.max(lista.length, 1)); }
    if (e.key === 'Enter') { e.preventDefault(); elegir(lista[indiceActivo]); }
  }

  const mostrar = abierto && valor.trim().length >= 2;
  return (
    <div ref={contenedorRef} className="relative hidden lg:block"
      onBlur={e => { if (!contenedorRef.current?.contains(e.relatedTarget as Node)) setAbierto(false); }}>
      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-sm focus-within:border-acento-500 focus-within:bg-white transition-colors">
        <span className="mr-2 text-slate-400" aria-hidden>🔍</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls="resultados-busqueda"
          aria-activedescendant={mostrar && lista.length ? `resultado-${indiceActivo}` : undefined}
          value={valor}
          onChange={e => { onCambiar(e.target.value); setAbierto(true); setActivo(0); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclado}
          placeholder="Buscar persona o área…"
          aria-label="Buscar persona o área"
          className="bg-transparent outline-none text-slate-700 placeholder:text-slate-400 w-56 [&::-webkit-search-cancel-button]:hidden"
        />
        {valor ? (
          <button type="button" onClick={() => { onCambiar(''); inputRef.current?.focus(); }} className="ml-1 text-slate-400 hover:text-slate-700 text-xs" aria-label="Limpiar búsqueda">✕</button>
        ) : (
          <kbd className="ml-1 text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5" title="Atajo: /">/</kbd>
        )}
      </div>

      {mostrar && (
        <div id="resultados-busqueda" role="listbox"
          className="absolute right-0 mt-2 w-[420px] max-h-[70vh] overflow-y-auto custom-scrollbar bg-white border border-marca-100 rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in">
          {lista.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Sin coincidencias para “{valor.trim()}”.</p>}

          {r.personas.length > 0 && <p className="px-4 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-marca-400">Personas · {r.totalPersonas}</p>}
          {r.personas.map((p, i) => (
            <button key={`p${p.emp.id}`} id={`resultado-${i}`} type="button" role="option" aria-selected={indiceActivo === i}
              onMouseEnter={() => setActivo(i)} onClick={() => elegir(p)}
              className={`w-full text-left px-4 py-2 flex items-center gap-3 ${indiceActivo === i ? 'bg-acento-50' : 'hover:bg-slate-50'}`}>
              <span className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-marca-400 to-marca-600 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>
                {p.emp.nombre.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-marca-900 truncate"><Resaltado texto={p.emp.nombre} consulta={valor} /></span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {p.campo === 'email' ? <Resaltado texto={p.emp.email} consulta={valor} /> : <Resaltado texto={p.emp.puesto} consulta={p.campo === 'puesto' ? valor : ''} />}
                  {nombreArea(p.emp.area_id) && <> · {nombreArea(p.emp.area_id)}</>}
                  {p.campo === 'perfil' && <> · <Resaltado texto={p.emp.tipo_perfil || ''} consulta={valor} /></>}
                </span>
              </span>
              {CAMPO[p.campo] && <span className="text-[9px] font-bold uppercase text-slate-400">{CAMPO[p.campo]}</span>}
            </button>
          ))}

          {r.areas.length > 0 && <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-marca-400">Áreas · {r.totalAreas}</p>}
          {r.areas.map((a, j) => {
            const i = r.personas.length + j;
            return (
              <button key={`a${a.area.id}`} id={`resultado-${i}`} type="button" role="option" aria-selected={indiceActivo === i}
                onMouseEnter={() => setActivo(i)} onClick={() => elegir(a)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 ${indiceActivo === i ? 'bg-acento-50' : 'hover:bg-slate-50'}`}>
                <span className="w-8 h-8 shrink-0 rounded-lg bg-marca-50 text-base flex items-center justify-center" aria-hidden>🏢</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-marca-900 truncate"><Resaltado texto={a.area.nombre} consulta={valor} /></span>
                  <span className="block text-[11px] text-slate-500">{a.personas} persona(s){nombreArea(a.area.parent_id) && <> · en {nombreArea(a.area.parent_id)}</>}</span>
                </span>
              </button>
            );
          })}

          {lista.length > 0 && (
            <div className="border-t border-slate-100 mt-2 pt-2 px-4 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">↑↓ navegar · Enter abrir · Esc cerrar</span>
              <button type="button" onClick={() => { setAbierto(false); onVerTodos(); }} className="font-bold text-acento-700 hover:underline">Filtrar el árbol por áreas →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
