'use client'
import { useMemo, useState } from 'react'
import { MONEDAS, type Area, type Empleado, type NivelCargo, type Puesto, type RangoSalarialCargo } from '@/lib/tipos'
import { validarCargo, type DatosCargo } from '@/lib/cargos'
import { buscarParecidos, limpiarNombre, normalizarNombre } from '@/lib/similitud'
import { normalizarTexto } from '@/lib/jerarquia'

export interface DatosRango { min: string; max: string; moneda: string }

interface Props {
  puestos: Puesto[];
  areas: Area[];
  niveles: NivelCargo[];
  /** Activos y desvinculados: para contar quién usa cada cargo (un cargo en uso no se puede eliminar) */
  empleados: Empleado[];
  /** null mientras cargan (solo Admin) */
  rangos: Map<number, RangoSalarialCargo> | null;
  monedaPrincipal: string;
  onGuardarCargo: (id: number | null, datos: DatosCargo, rango: DatosRango) => Promise<boolean>;
  onEliminarCargo: (p: Puesto) => Promise<boolean>;
  onGuardarNivel: (id: number | null, nombre: string) => Promise<boolean>;
  onEliminarNivel: (n: NivelCargo) => Promise<boolean>;
  onOrdenarNiveles: (ordenados: NivelCargo[]) => Promise<void>;
  onClose: () => void;
}

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-acento-500';
const labelCls = 'text-[10px] font-black uppercase text-slate-400 block mb-1';

/** Catálogo de cargos (tabla "puestos") y niveles de la empresa. Solo Admin. */
export function CatalogoCargos(props: Props) {
  const { puestos, areas, niveles, empleados, onClose } = props;
  const [pestana, setPestana] = useState<'cargos' | 'niveles'>('cargos');
  const sinArea = puestos.filter(p => p.area_id == null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 backdrop-blur-sm p-3 md:p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-marca-900">💼 Catálogo de cargos</h3>
            <p className="text-[11px] text-slate-500">Cada cargo pertenece a un área. Los nombres no se repiten dentro de un área (sin importar mayúsculas ni tildes).</p>
          </div>
          <div className="flex items-center gap-2">
            {(['cargos', 'niveles'] as const).map(p => (
              <button key={p} type="button" onClick={() => setPestana(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${pestana === p ? 'bg-marca-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p === 'cargos' ? `Cargos (${puestos.length})` : `Niveles (${niveles.length})`}
                {p === 'cargos' && sinArea > 0 && <span className="ml-1 text-amber-400">●</span>}
              </button>
            ))}
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {pestana === 'cargos' ? <ListaCargos {...props} /> : <ListaNiveles {...props} puestos={puestos} />}
        </div>
        <div className="px-6 py-3 border-t border-slate-100 text-[11px] text-slate-500 shrink-0">
          Para cargar muchos a la vez usa <strong>📥 Importar</strong> (hojas Áreas y Cargos). {empleados.length > 0 && 'Un cargo en uso no se puede eliminar.'}
          {areas.length === 0 && <span className="text-amber-700 font-semibold"> Primero crea al menos un área.</span>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------

function ListaCargos({ puestos, areas, niveles, empleados, rangos, monedaPrincipal, onGuardarCargo, onEliminarCargo }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState<string>(''); // '' todas · 'sin' sin área · id
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null);

  const usos = useMemo(() => {
    const m = new Map<number, number>();
    empleados.forEach(e => { if (e.puesto_id) m.set(e.puesto_id, (m.get(e.puesto_id) || 0) + 1); });
    return m;
  }, [empleados]);
  const nombreArea = (id: number | null | undefined) => areas.find(a => a.id === id)?.nombre ?? '';
  const q = normalizarTexto(busqueda);
  const visibles = puestos
    .filter(p => !q || normalizarTexto(p.nombre).includes(q) || normalizarTexto(nombreArea(p.area_id)).includes(q))
    .filter(p => filtroArea === '' || (filtroArea === 'sin' ? p.area_id == null : String(p.area_id) === filtroArea));
  const grupos = new Map<string, Puesto[]>();
  visibles.forEach(p => { const k = p.area_id == null ? '' : nombreArea(p.area_id) || 'Área eliminada'; grupos.set(k, [...(grupos.get(k) || []), p]); });
  const ordenGrupos = [...grupos.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'es')));
  const sinArea = puestos.filter(p => p.area_id == null).length;

  return (
    <div className="space-y-4">
      {sinArea > 0 && (
        <button type="button" onClick={() => setFiltroArea('sin')} className="w-full text-left text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 hover:bg-amber-100">
          ◐ <strong>{sinArea} cargo(s) sin área.</strong> El área ahora es obligatoria: edítalos para asignarla (o súbelos en la hoja Cargos).
        </button>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${inputCls} max-w-xs`} placeholder="Buscar cargo o área…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select className={`${inputCls} max-w-[220px]`} value={filtroArea} onChange={e => setFiltroArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          <option value="sin">Sin área</option>
          {[...areas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <button type="button" disabled={areas.length === 0} onClick={() => setEditando('nuevo')}
          className="ml-auto bg-marca-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-marca-800 disabled:opacity-40">+ Nuevo cargo</button>
      </div>

      {editando === 'nuevo' && (
        <FormCargo puestos={puestos} areas={areas} niveles={niveles} monedaPrincipal={monedaPrincipal}
          areaInicial={filtroArea && filtroArea !== 'sin' ? filtroArea : ''}
          onCancelar={() => setEditando(null)}
          onGuardar={async (d, r) => { const ok = await onGuardarCargo(null, d, r); if (ok) setEditando(null); return ok; }} />
      )}

      {visibles.length === 0 && <p className="text-xs text-slate-400 italic">No hay cargos {busqueda || filtroArea ? 'con ese filtro' : 'todavía'}.</p>}
      {ordenGrupos.map(g => (
        <div key={g || 'sin'} className="border border-slate-200 rounded-2xl overflow-hidden">
          <p className={`px-4 py-2 text-[11px] font-black uppercase tracking-wider ${g === '' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-500'}`}>
            {g === '' ? '⚠️ Sin área' : `🏢 ${g}`} · {grupos.get(g)!.length}
          </p>
          <div className="divide-y divide-slate-100">
            {grupos.get(g)!.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => {
              const n = usos.get(p.id) || 0;
              const r = rangos?.get(p.id);
              if (editando === p.id) {
                return (
                  <div key={p.id} className="p-3">
                    <FormCargo puestos={puestos} areas={areas} niveles={niveles} monedaPrincipal={monedaPrincipal} cargo={p} rango={r}
                      onCancelar={() => setEditando(null)}
                      onGuardar={async (d, rr) => { const ok = await onGuardarCargo(p.id, d, rr); if (ok) setEditando(null); return ok; }} />
                  </div>
                );
              }
              return (
                <div key={p.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-bold text-marca-900">{p.nombre}</p>
                    <p className="text-[10px] text-slate-500">
                      {[niveles.find(x => x.id === p.nivel_id)?.nombre, `${n} persona(s)`, r && `Rango ${[r.salario_min, r.salario_max].map(v => (v == null ? '—' : Number(v).toLocaleString('es-CO'))).join(' – ')} ${r.moneda}`, p.descripcion && 'con descripción']
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditando(p.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${p.area_id == null ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {p.area_id == null ? 'Asignar área' : 'Editar'}
                  </button>
                  <button type="button" disabled={n > 0} title={n > 0 ? 'Tiene colaboradores: muévelos a otro cargo antes de eliminarlo.' : 'Eliminar'}
                    onClick={() => { if (window.confirm(`¿Eliminar el cargo "${p.nombre}"?`)) onEliminarCargo(p); }}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent">🗑</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormCargo({ puestos, areas, niveles, monedaPrincipal, cargo, rango, areaInicial = '', onGuardar, onCancelar }: {
  puestos: Puesto[]; areas: Area[]; niveles: NivelCargo[]; monedaPrincipal: string;
  cargo?: Puesto; rango?: RangoSalarialCargo; areaInicial?: string;
  onGuardar: (d: DatosCargo, r: DatosRango) => Promise<boolean>; onCancelar: () => void;
}) {
  const [d, setD] = useState<DatosCargo>({
    nombre: cargo?.nombre ?? '', area_id: cargo?.area_id ? String(cargo.area_id) : areaInicial,
    nivel_id: cargo?.nivel_id ? String(cargo.nivel_id) : '', descripcion: cargo?.descripcion ?? '',
  });
  const [r, setR] = useState<DatosRango>({
    min: rango?.salario_min != null ? String(rango.salario_min) : '', max: rango?.salario_max != null ? String(rango.salario_max) : '',
    moneda: rango?.moneda ?? monedaPrincipal,
  });
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(false);
  const error = validarCargo(d, puestos, cargo?.id);
  // Aviso (no bloquea): nombres parecidos en la misma área
  const parecidos = d.area_id && limpiarNombre(d.nombre)
    ? buscarParecidos(d.nombre, puestos.filter(p => p.id !== cargo?.id && String(p.area_id) === d.area_id).map(p => ({ valor: p.id, nombre: p.nombre })))
    : [];
  const set = <K extends keyof DatosCargo>(k: K, v: string) => setD(prev => ({ ...prev, [k]: v }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (error) return;
    setGuardando(true);
    await onGuardar(d, r);
    setGuardando(false);
  }

  return (
    <form onSubmit={guardar} className="border-2 border-marca-900 rounded-2xl p-4 space-y-3 bg-white">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Nombre del cargo *</label>
          <input className={inputCls} value={d.nombre} autoFocus onChange={e => set('nombre', e.target.value)} placeholder="Ej: Analista de inventarios" />
        </div>
        <div>
          <label className={labelCls}>Área *</label>
          <select className={inputCls} value={d.area_id} onChange={e => set('area_id', e.target.value)}>
            <option value="">-- Seleccionar --</option>
            {[...areas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Nivel</label>
          <select className={inputCls} value={d.nivel_id} onChange={e => set('nivel_id', e.target.value)}>
            <option value="">Sin nivel</option>
            {niveles.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </select>
          {niveles.length === 0 && <p className="text-[10px] text-slate-500 mt-0.5">Crea los niveles en la pestaña Niveles.</p>}
        </div>
        <div>
          <label className={labelCls}>Rango salarial (solo Admin)</label>
          <div className="flex gap-1">
            <input className={inputCls} inputMode="decimal" placeholder="Mínimo" value={r.min} onChange={e => setR(x => ({ ...x, min: e.target.value }))} />
            <input className={inputCls} inputMode="decimal" placeholder="Máximo" value={r.max} onChange={e => setR(x => ({ ...x, max: e.target.value }))} />
            <select className={`${inputCls} max-w-[80px]`} value={r.moneda} onChange={e => setR(x => ({ ...x, moneda: e.target.value }))}>
              {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Descripción / funciones</label>
        <textarea className={`${inputCls} min-h-[70px]`} value={d.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Propósito del cargo y funciones principales" />
      </div>
      {parecidos.length > 0 && !error && (
        <p className="text-[11px] text-amber-700">◐ Se parece a {parecidos.map(p => `«${p.nombre}»`).join(', ')} en esta área. ¿Seguro que no es el mismo?</p>
      )}
      {intento && error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
      {cargo && normalizarNombre(cargo.nombre) !== normalizarNombre(d.nombre) && (
        <p className="text-[11px] text-slate-500">Al renombrarlo se actualiza el cargo de todas las personas que lo tienen (queda en su historial).</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-5 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl disabled:opacity-50">
          {guardando ? 'Guardando…' : cargo ? 'Guardar cambios' : 'Crear cargo'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------

function ListaNiveles({ niveles, puestos, onGuardarNivel, onEliminarNivel, onOrdenarNiveles }: Props) {
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const usos = (id: number) => puestos.filter(p => p.nivel_id === id).length;
  const duplicado = (nombre: string, id?: number) => niveles.find(n => n.id !== id && normalizarNombre(n.nombre) === normalizarNombre(nombre));
  const parecidosNuevo = limpiarNombre(nuevo) ? buscarParecidos(nuevo, niveles.map(n => ({ valor: n.id, nombre: n.nombre }))) : [];

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!limpiarNombre(nuevo) || duplicado(nuevo)) return;
    if (await onGuardarNivel(null, limpiarNombre(nuevo))) setNuevo('');
  }
  function mover(i: number, delta: number) {
    const lista = [...niveles];
    const [n] = lista.splice(i, 1);
    lista.splice(i + delta, 0, n);
    onOrdenarNiveles(lista);
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-xs text-slate-600">Ordena los niveles de menor a mayor jerarquía (p. ej. Operativo → Profesional → Jefatura → Gerencia). Se usan para agrupar cargos y comparar salarios.</p>
      <form onSubmit={agregar} className="space-y-1">
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Nuevo nivel, ej: Profesional" value={nuevo} onChange={e => setNuevo(e.target.value)} />
          <button type="submit" disabled={!limpiarNombre(nuevo) || !!duplicado(nuevo)} className="bg-marca-900 text-white px-4 rounded-xl text-xs font-bold disabled:opacity-40">+ Nivel</button>
        </div>
        {duplicado(nuevo) && <p className="text-[11px] font-semibold text-red-600">Ya existe el nivel «{duplicado(nuevo)!.nombre}».</p>}
        {!duplicado(nuevo) && parecidosNuevo.length > 0 && <p className="text-[11px] text-amber-700">◐ Se parece a {parecidosNuevo.map(p => `«${p.nombre}»`).join(', ')}.</p>}
      </form>
      {niveles.length === 0 && <p className="text-xs text-slate-400 italic">Aún no hay niveles.</p>}
      <ol className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {niveles.map((n, i) => (
          <li key={n.id} className="px-4 py-2.5 flex items-center gap-2">
            <span className="text-[11px] font-black text-slate-400 w-5">{i + 1}</span>
            {editando?.id === n.id ? (
              <form className="flex-1 flex gap-1" onSubmit={async e => {
                e.preventDefault();
                if (!limpiarNombre(editando.nombre) || duplicado(editando.nombre, n.id)) return;
                if (await onGuardarNivel(n.id, limpiarNombre(editando.nombre))) setEditando(null);
              }}>
                <input className={inputCls} autoFocus value={editando.nombre} onChange={e => setEditando({ id: n.id, nombre: e.target.value })} />
                <button type="submit" disabled={!!duplicado(editando.nombre, n.id)} className="px-2.5 rounded-xl bg-marca-900 text-white text-xs font-bold disabled:opacity-40">✓</button>
                <button type="button" onClick={() => setEditando(null)} className="px-2 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-100">✕</button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm font-bold text-marca-900">{n.nombre} <span className="text-[10px] font-normal text-slate-500">· {usos(n.id)} cargo(s)</span></span>
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Subir">↑</button>
                <button type="button" disabled={i === niveles.length - 1} onClick={() => mover(i, 1)} className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Bajar">↓</button>
                <button type="button" onClick={() => setEditando({ id: n.id, nombre: n.nombre })} className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100">Renombrar</button>
                <button type="button" onClick={() => {
                  const u = usos(n.id);
                  if (window.confirm(u > 0 ? `${u} cargo(s) quedarán sin nivel. ¿Eliminar "${n.nombre}"?` : `¿Eliminar el nivel "${n.nombre}"?`)) onEliminarNivel(n);
                }} className="px-2 py-1 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50">🗑</button>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
