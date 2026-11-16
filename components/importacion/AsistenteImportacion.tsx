'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Area, Empleado, Puesto } from '@/lib/tipos'
import {
  COLUMNAS, analizarImportacion, detectarMapeo,
  type AccionFila, type ClaveColumna, type FilaArchivo, type OpcionesImportacion,
} from '@/lib/importacion'
import { leerArchivo, descargarPlantilla, descargarErrores, type ArchivoLeido } from '@/lib/archivoImportacion'
import { aplicarImportacion, cargarContextoImportacion, type ContextoImportacionApi, type ResultadoAplicacion } from '@/lib/importacionApi'
import { mensajeDeError } from '@/lib/errores'

interface Props {
  activos: Empleado[];
  desvinculados: Empleado[];
  areas: Area[];
  puestos: Puesto[];
  emailImportador: string;
  onClose: () => void;
  /** Se llama tras aplicar, para recargar datos. creadosIds sirve para "dar acceso a los nuevos". */
  onAplicado: (creadosIds: number[], darAcceso: boolean) => void;
}

type Paso = 'inicio' | 'columnas' | 'revision' | 'resultado';
const PASOS: { id: Paso; titulo: string }[] = [
  { id: 'inicio', titulo: 'Archivo' }, { id: 'columnas', titulo: 'Columnas' },
  { id: 'revision', titulo: 'Revisión' }, { id: 'resultado', titulo: 'Resultado' },
];

const ESTILO_ACCION: Record<AccionFila, { texto: string; clase: string }> = {
  crear: { texto: '＋ Nuevo', clase: 'bg-emerald-100 text-emerald-800' },
  actualizar: { texto: '↻ Actualiza', clase: 'bg-blue-100 text-blue-800' },
  sin_cambios: { texto: '＝ Sin cambios', clase: 'bg-slate-100 text-slate-600' },
  error: { texto: '✕ Error', clase: 'bg-red-100 text-red-800' },
};

const LIMITE_VISTA = 200;

export function AsistenteImportacion({ activos, desvinculados, areas, puestos, emailImportador, onClose, onAplicado }: Props) {
  const [paso, setPaso] = useState<Paso>('inicio');
  const [ctxApi, setCtxApi] = useState<ContextoImportacionApi | null>(null);
  const [errorCtx, setErrorCtx] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeo, setMapeo] = useState<(ClaveColumna | null)[]>([]);
  const [opciones, setOpciones] = useState<OpcionesImportacion>({ crearPuestos: false, crearAreas: false });
  const [filtro, setFiltro] = useState<AccionFila | 'todas'>('todas');
  const [confirmaCambios, setConfirmaCambios] = useState(false);
  const [darAcceso, setDarAcceso] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAplicacion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    cargarContextoImportacion().then(setCtxApi).catch(e => setErrorCtx(mensajeDeError(e)));
  }, []);

  const salariosVigentes = useMemo(
    () => new Map((ctxApi?.salarios || []).map(s => [s.empleado_id, { salario: s.salario, moneda: s.moneda, periodicidad: s.periodicidad }])),
    [ctxApi],
  );

  // Filas del archivo según el mapeo de columnas
  const filasArchivo: FilaArchivo[] = useMemo(() => {
    if (!archivo) return [];
    return archivo.filas.map(f => {
      const valores: FilaArchivo['valores'] = {};
      mapeo.forEach((clave, i) => { if (clave) valores[clave] = (f.celdas[i] ?? '').trim(); });
      return { numero: f.numero, valores };
    });
  }, [archivo, mapeo]);

  const analisis = useMemo(() => {
    if (!ctxApi || paso === 'inicio' || paso === 'columnas') return null;
    return analizarImportacion(filasArchivo, {
      activos, desvinculados, areas, puestos, salariosVigentes, emailImportador, monedaPorDefecto: ctxApi.monedaPrincipal,
    }, opciones);
  }, [ctxApi, paso, filasArchivo, activos, desvinculados, areas, puestos, salariosVigentes, emailImportador, opciones]);

  // ---------- Paso 1: archivo ----------
  async function plantilla(conDatos: boolean) {
    setOcupado('Generando plantilla…');
    try {
      await descargarPlantilla({
        puestos, areas, monedaPrincipal: ctxApi?.monedaPrincipal || 'COP',
        colaboradores: conDatos ? activos : undefined,
        salarios: conDatos ? new Map((ctxApi?.salarios || []).map(s => [s.empleado_id, s])) : undefined,
        potencialEvaluado: conDatos ? new Set(ctxApi?.potencialEvaluadoIds || []) : undefined,
      });
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(null); }
  }

  async function cargar(file: File | undefined) {
    if (!file) return;
    setOcupado('Leyendo archivo…');
    try {
      const leido = await leerArchivo(file);
      if (leido.filas.length === 0) throw new Error('El archivo no tiene filas de datos debajo de los encabezados.');
      setArchivo(leido);
      setNombreArchivo(file.name);
      setMapeo(detectarMapeo(leido.encabezados));
      setPaso('columnas');
    } catch (e) { alert(mensajeDeError(e)); }
    finally {
      setOcupado(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  // ---------- Paso 2: columnas ----------
  const clavesUsadas = mapeo.filter((c): c is ClaveColumna => !!c);
  const duplicadas = clavesUsadas.filter((c, i) => clavesUsadas.indexOf(c) !== i);
  const faltaEmail = !clavesUsadas.includes('email');

  // ---------- Paso 3: revisión ----------
  const aActualizar = analisis?.filas.filter(f => f.accion === 'actualizar') ?? [];
  const aCrear = analisis?.filas.filter(f => f.accion === 'crear') ?? [];
  const conErrores = analisis?.filas.filter(f => f.accion === 'error') ?? [];
  const visibles = (analisis?.filas ?? []).filter(f => filtro === 'todas' || f.accion === filtro);
  const puedeAplicar = aCrear.length + aActualizar.length > 0 && (aActualizar.length === 0 || confirmaCambios);

  async function aplicar() {
    if (!analisis || !puedeAplicar) return;
    setOcupado('Aplicando cambios… no cierres esta ventana.');
    try {
      const confirmados = [...aCrear, ...aActualizar].map(f => f.email);
      const r = await aplicarImportacion(filasArchivo, opciones, confirmados);
      setResultado(r);
      setPaso('resultado');
      onAplicado(r.creadosIds, darAcceso && r.creadosIds.length > 0);
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(null); }
  }

  async function bajarErrores() {
    if (!archivo || !analisis) return;
    const porNumero = new Map(archivo.filas.map(f => [f.numero, f.celdas]));
    await descargarErrores(archivo.encabezados, conErrores.map(f => ({ celdas: porNumero.get(f.numero) || [], errores: f.errores })));
  }

  function cerrar() {
    if ((paso === 'columnas' || paso === 'revision') && !window.confirm('¿Salir sin aplicar la importación?')) return;
    onClose();
  }

  const indicePaso = PASOS.findIndex(p => p.id === paso);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 md:p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-5xl h-full max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header + pasos */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">📥 Importar colaboradores</h3>
            <p className="text-[11px] text-slate-500">Crea nuevos y actualiza existentes desde Excel. Verás cada cambio antes de aplicarlo.</p>
          </div>
          <ol className="flex items-center gap-1.5" aria-label="Pasos">
            {PASOS.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-1.5 text-[11px] font-bold ${i <= indicePaso ? 'text-slate-800' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i < indicePaso ? 'bg-emerald-600 text-white' : i === indicePaso ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>
                  {i < indicePaso ? '✓' : i + 1}
                </span>
                <span className="hidden sm:inline">{p.titulo}</span>
                {i < PASOS.length - 1 && <span className="text-slate-300 mx-0.5">›</span>}
              </li>
            ))}
          </ol>
          <button type="button" onClick={cerrar} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200" aria-label="Cerrar">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {errorCtx && <p className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">No se pudo preparar la importación: {errorCtx}</p>}

          {/* ===== PASO 1 ===== */}
          {paso === 'inicio' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">1 · Descarga la plantilla</p>
                <p className="text-xs text-slate-600">
                  Trae listas desplegables, una hoja de instrucciones y las {COLUMNAS.length} columnas de la ficha (incluidos salario y potencial).
                </p>
                <button type="button" disabled={!!ocupado || !ctxApi} onClick={() => plantilla(true)}
                  className="w-full text-left p-3 rounded-xl border-2 border-slate-800 hover:bg-slate-50 disabled:opacity-50">
                  <span className="text-sm font-bold text-slate-800">⬇️ Con mis {activos.length} colaboradores actuales</span>
                  <span className="block text-[11px] text-slate-500">Recomendado para completar datos: llena lo que falta (salario, fecha de ingreso, sede…) y vuelve a subirlo.</span>
                </button>
                <button type="button" disabled={!!ocupado || !ctxApi} onClick={() => plantilla(false)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                  <span className="text-sm font-bold text-slate-700">⬇️ Plantilla vacía</span>
                  <span className="block text-[11px] text-slate-500">Para registrar personas nuevas.</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl p-5 space-y-3 flex flex-col">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">2 · Sube tu archivo</p>
                <button
                  type="button"
                  disabled={!!ocupado || !ctxApi}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={e => { e.preventDefault(); setArrastrando(false); cargar(e.dataTransfer.files?.[0]); }}
                  className={`flex-1 min-h-[160px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 p-6 transition disabled:opacity-50 ${arrastrando ? 'border-[#FF4C4C] bg-red-50/50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
                >
                  <span className="text-3xl">📄</span>
                  <span className="text-sm font-bold text-slate-700">Arrastra el archivo aquí o haz clic</span>
                  <span className="text-[11px] text-slate-500">.xlsx o .csv · hasta 1.000 filas · puede tener tus propios encabezados</span>
                </button>
                <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => cargar(e.target.files?.[0])} />
              </div>
            </div>
          )}

          {/* ===== PASO 2 ===== */}
          {paso === 'columnas' && archivo && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                <strong>{nombreArchivo}</strong> · {archivo.filas.length} fila(s). Revisa a qué dato corresponde cada columna; reconocimos las que pudimos automáticamente.
              </p>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wider">
                    <tr><th className="text-left px-4 py-2">Columna del archivo</th><th className="text-left px-3 py-2">Ejemplo</th><th className="text-left px-4 py-2">Se carga como</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {archivo.encabezados.map((h, i) => {
                      const clave = mapeo[i];
                      const repetida = clave && duplicadas.includes(clave);
                      return (
                        <tr key={i} className={clave ? '' : 'bg-slate-50/50'}>
                          <td className="px-4 py-2 font-bold text-slate-800">{h || <span className="italic text-slate-400">(sin título)</span>}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{archivo.filas.find(f => f.celdas[i]?.trim())?.celdas[i] || '—'}</td>
                          <td className="px-4 py-2">
                            <select
                              value={clave ?? ''}
                              onChange={e => setMapeo(prev => prev.map((c, j) => (j === i ? (e.target.value as ClaveColumna) || null : c)))}
                              className={`text-xs border rounded-lg px-2 py-1.5 outline-none w-full max-w-[240px] ${repetida ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}
                            >
                              <option value="">— No importar —</option>
                              {COLUMNAS.map(c => <option key={c.clave} value={c.clave}>{c.encabezado}{c.obligatoria === 'siempre' ? ' *' : ''}</option>)}
                            </select>
                            {repetida && <p className="text-[10px] text-red-600 mt-0.5">Esta columna está asignada dos veces.</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {faltaEmail && <p className="text-xs font-semibold text-red-600">Falta la columna &quot;Email&quot;: es la que identifica a cada colaborador.</p>}
            </div>
          )}

          {/* ===== PASO 3 ===== */}
          {paso === 'revision' && analisis && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([['crear', 'Se crearán'], ['actualizar', 'Se actualizarán'], ['sin_cambios', 'Sin cambios'], ['error', 'Con errores']] as [AccionFila, string][]).map(([a, t]) => (
                  <button key={a} type="button" onClick={() => setFiltro(filtro === a ? 'todas' : a)}
                    className={`text-left p-3 rounded-xl border transition ${filtro === a ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTILO_ACCION[a].clase}`}>{ESTILO_ACCION[a].texto}</span>
                    <p className="text-2xl font-black text-slate-800 mt-1">{analisis.resumen[a]}</p>
                    <p className="text-[11px] text-slate-500">{t}</p>
                  </button>
                ))}
              </div>

              {/* Opciones que cambian el análisis */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-[#FF4C4C]" checked={opciones.crearPuestos} onChange={e => setOpciones(o => ({ ...o, crearPuestos: e.target.checked }))} />
                  Crear los puestos que no existen{analisis.puestosNuevos.length > 0 && <strong> ({analisis.puestosNuevos.join(', ')})</strong>}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-[#FF4C4C]" checked={opciones.crearAreas} onChange={e => setOpciones(o => ({ ...o, crearAreas: e.target.checked }))} />
                  Crear las áreas que no existen{analisis.areasNuevas.length > 0 && <strong> ({analisis.areasNuevas.join(', ')})</strong>}
                </label>
                {conErrores.length > 0 && (
                  <button type="button" onClick={bajarErrores} className="ml-auto font-bold text-[#FF4C4C] hover:underline">⬇️ Descargar filas con errores para corregir</button>
                )}
              </div>

              {/* Filas */}
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {visibles.length === 0 && <p className="text-xs text-slate-400 italic p-4">No hay filas en este grupo.</p>}
                {visibles.slice(0, LIMITE_VISTA).map(f => (
                  <div key={f.numero} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
                    <div className="sm:w-64 shrink-0 min-w-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTILO_ACCION[f.accion].clase}`}>{ESTILO_ACCION[f.accion].texto}</span>
                      <p className="text-sm font-bold text-slate-800 truncate mt-1">{f.datos?.nombre || f.nombre || '(sin nombre)'}</p>
                      <p className="text-[10px] text-slate-500 truncate">Fila {f.numero} · {f.email || 'sin email'}</p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      {f.errores.map((e, i) => <p key={i} className="text-[11px] text-red-700">✕ {e}</p>)}
                      {(f.accion === 'actualizar' || f.accion === 'sin_cambios') && f.cambios.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {f.cambios.map((c, i) => (
                            <span key={i} className="text-[10px] bg-blue-50 border border-blue-100 text-slate-700 px-2 py-0.5 rounded-full">
                              <strong>{c.campo}:</strong> <span className="text-slate-400 line-through">{c.antes}</span> → {c.despues}
                            </span>
                          ))}
                        </div>
                      )}
                      {f.accion === 'crear' && (
                        <p className="text-[11px] text-slate-600">{[f.puestoNombre, f.areaNombre, f.datos?.tipo_perfil].filter(Boolean).join(' · ')}{f.cambios.length > 0 && ` · ${f.cambios.map(c => `${c.campo}: ${c.despues}`).join(' · ')}`}</p>
                      )}
                      {f.advertencias.map((a, i) => <p key={i} className="text-[11px] text-amber-700">◐ {a}</p>)}
                    </div>
                  </div>
                ))}
                {visibles.length > LIMITE_VISTA && <p className="text-[11px] text-slate-500 p-3 text-center">Mostrando {LIMITE_VISTA} de {visibles.length}. Usa los filtros de arriba para ver el resto.</p>}
              </div>
            </div>
          )}

          {/* ===== PASO 4 ===== */}
          {paso === 'resultado' && resultado && (
            <div className="space-y-4">
              {(() => {
                const ok = resultado.resultados.filter(r => r.ok);
                const fallidas = resultado.resultados.filter(r => !r.ok);
                const conAvisos = ok.filter(r => r.mensaje);
                return (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                      <p className="text-lg font-black text-emerald-800">✓ Importación aplicada</p>
                      <p className="text-sm text-emerald-900">
                        {ok.filter(r => r.accion === 'crear').length} creado(s) · {ok.filter(r => r.accion === 'actualizar').length} actualizado(s)
                        {fallidas.length > 0 && ` · ${fallidas.length} no se pudieron aplicar`}
                      </p>
                      {(resultado.puestosCreados.length > 0 || resultado.areasCreadas.length > 0) && (
                        <p className="text-xs text-emerald-800 mt-1">
                          {resultado.puestosCreados.length > 0 && `Puestos nuevos: ${resultado.puestosCreados.join(', ')}. `}
                          {resultado.areasCreadas.length > 0 && `Áreas nuevas: ${resultado.areasCreadas.join(', ')} (ubícalas en el organigrama con "Depende de").`}
                        </p>
                      )}
                      <p className="text-xs text-emerald-800 mt-1">Todos los cambios quedaron registrados en el historial de cada colaborador.</p>
                    </div>
                    {[...fallidas, ...conAvisos].length > 0 && (
                      <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                        {[...fallidas, ...conAvisos].map(r => (
                          <div key={r.numero} className="px-4 py-2.5 text-xs">
                            <span className={`font-bold ${r.ok ? 'text-amber-700' : 'text-red-700'}`}>{r.ok ? '◐' : '✕'} Fila {r.numero} · {r.nombre || r.email}</span>
                            <span className="text-slate-600"> — {r.mensaje}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white">
          <div className="text-[11px] text-slate-500 min-h-[1rem]">{ocupado}</div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {paso === 'columnas' && (
              <>
                <button type="button" onClick={() => setPaso('inicio')} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">← Otro archivo</button>
                <button type="button" disabled={faltaEmail || duplicadas.length > 0 || !ctxApi} onClick={() => { setFiltro('todas'); setPaso('revision'); }}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl disabled:opacity-40">Revisar cambios →</button>
              </>
            )}
            {paso === 'revision' && analisis && (
              <>
                {aActualizar.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <input type="checkbox" className="accent-blue-600" checked={confirmaCambios} onChange={e => setConfirmaCambios(e.target.checked)} />
                    Confirmo que se modificarán <strong>{aActualizar.length}</strong> colaborador(es) existente(s)
                  </label>
                )}
                {aCrear.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="accent-[#FF4C4C]" checked={darAcceso} onChange={e => setDarAcceso(e.target.checked)} />
                    🔑 Dar acceso a los {aCrear.length} nuevo(s)
                  </label>
                )}
                <button type="button" onClick={() => setPaso('columnas')} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">← Columnas</button>
                <button type="button" disabled={!puedeAplicar || !!ocupado} onClick={aplicar}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl disabled:opacity-40">
                  Aplicar ({aCrear.length} nuevos · {aActualizar.length} actualizaciones)
                </button>
              </>
            )}
            {(paso === 'resultado' || paso === 'inicio') && (
              <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl">{paso === 'resultado' ? 'Listo' : 'Cerrar'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
