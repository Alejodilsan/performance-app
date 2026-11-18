'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Area, Empleado, Puesto } from '@/lib/tipos'
import { COLUMNAS, detectarMapeo, type AccionFila, type DefColumna, type FilaAnalizada, type OpcionesImportacion } from '@/lib/importacion'
import {
  COLUMNAS_AREAS, COLUMNAS_CARGOS, NOMBRE_HOJA, analizarCarga, filaValida, resumenAcciones,
  type Decisiones, type FilaEstructura, type Hoja, type LibroCarga, type Parecido,
} from '@/lib/estructura'
import { leerLibro, descargarPlantilla, descargarErrores, type LibroLeido } from '@/lib/archivoImportacion'
import { aplicarImportacion, cargarContextoImportacion, type ContextoImportacionApi, type ResultadoAplicacion } from '@/lib/importacionApi'
import { normalizarNombre } from '@/lib/similitud'
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
const HOJAS: Hoja[] = ['areas', 'cargos', 'colaboradores'];
const COLUMNAS_HOJA: Record<Hoja, DefColumna<string>[]> = {
  areas: COLUMNAS_AREAS, cargos: COLUMNAS_CARGOS, colaboradores: COLUMNAS as unknown as DefColumna<string>[],
};
const OBLIGATORIAS: Record<Hoja, string[]> = { areas: ['nombre'], cargos: ['nombre', 'area'], colaboradores: ['email'] };
const ICONO: Record<Hoja, string> = { areas: '🏢', cargos: '💼', colaboradores: '👥' };

const ESTILO_ACCION: Record<AccionFila, { texto: string; clase: string }> = {
  crear: { texto: '＋ Nuevo', clase: 'bg-emerald-100 text-emerald-800' },
  actualizar: { texto: '↻ Actualiza', clase: 'bg-blue-100 text-blue-800' },
  sin_cambios: { texto: '＝ Sin cambios', clase: 'bg-slate-100 text-slate-600' },
  error: { texto: '✕ Error', clase: 'bg-red-100 text-red-800' },
};
const TIPO_PARECIDO = { area: 'Área', cargo: 'Cargo', nivel: 'Nivel' } as const;

const LIMITE_VISTA = 200;

export function AsistenteImportacion({ activos, desvinculados, areas, puestos, emailImportador, onClose, onAplicado }: Props) {
  const [paso, setPaso] = useState<Paso>('inicio');
  const [ctxApi, setCtxApi] = useState<ContextoImportacionApi | null>(null);
  const [errorCtx, setErrorCtx] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<LibroLeido | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeos, setMapeos] = useState<Partial<Record<Hoja, (string | null)[]>>>({});
  const [hojaActiva, setHojaActiva] = useState<Hoja>('colaboradores');
  const [opciones, setOpciones] = useState<OpcionesImportacion>({ crearPuestos: false, crearAreas: false });
  const [decisiones, setDecisiones] = useState<Decisiones>({});
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

  const hojasPresentes = HOJAS.filter(h => archivo?.[h]);

  // Filas del libro según el mapeo de columnas de cada hoja
  const libro: LibroCarga = useMemo(() => {
    const filas = (h: Hoja) => {
      const hoja = archivo?.[h];
      const mapeo = mapeos[h] || [];
      if (!hoja) return [];
      return hoja.filas.map(f => {
        const valores: Record<string, string> = {};
        mapeo.forEach((clave, i) => { if (clave) valores[clave] = (f.celdas[i] ?? '').trim(); });
        return { numero: f.numero, valores };
      });
    };
    return { areas: filas('areas'), cargos: filas('cargos'), colaboradores: filas('colaboradores') } as LibroCarga;
  }, [archivo, mapeos]);

  const contexto = useMemo(() => ctxApi && ({
    activos, desvinculados, areas, puestos, niveles: ctxApi.niveles,
    rangos: new Map(ctxApi.rangos.map(r => [r.puesto_id, r])),
    salariosVigentes: new Map(ctxApi.salarios.map(s => [s.empleado_id, { salario: s.salario, moneda: s.moneda, periodicidad: s.periodicidad }])),
    emailImportador, monedaPorDefecto: ctxApi.monedaPrincipal,
  }), [ctxApi, activos, desvinculados, areas, puestos, emailImportador]);

  const analisis = useMemo(() => {
    if (!contexto || paso === 'inicio' || paso === 'columnas') return null;
    return analizarCarga(libro, contexto, opciones, decisiones);
  }, [contexto, paso, libro, opciones, decisiones]);

  // ---------- Paso 1: archivo ----------
  async function plantilla(conDatos: boolean) {
    if (!ctxApi) return;
    setOcupado('Generando plantilla…');
    try {
      await descargarPlantilla({
        puestos, areas, activos, niveles: ctxApi.niveles, monedaPrincipal: ctxApi.monedaPrincipal,
        rangos: new Map(ctxApi.rangos.map(r => [r.puesto_id, r])),
        colaboradores: conDatos ? activos : undefined,
        salarios: conDatos ? new Map(ctxApi.salarios.map(s => [s.empleado_id, s])) : undefined,
        potencialEvaluado: conDatos ? new Set(ctxApi.potencialEvaluadoIds) : undefined,
      });
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(null); }
  }

  async function cargar(file: File | undefined) {
    if (!file) return;
    setOcupado('Leyendo archivo…');
    try {
      const leido = await leerLibro(file);
      setArchivo(leido);
      setNombreArchivo(file.name);
      const nuevos: Partial<Record<Hoja, (string | null)[]>> = {};
      HOJAS.forEach(h => { if (leido[h]) nuevos[h] = detectarMapeo(leido[h]!.encabezados, COLUMNAS_HOJA[h]); });
      setMapeos(nuevos);
      setDecisiones({});
      setHojaActiva(HOJAS.find(h => leido[h]) ?? 'colaboradores');
      setPaso('columnas');
    } catch (e) { alert(mensajeDeError(e)); }
    finally {
      setOcupado(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  // ---------- Paso 2: columnas ----------
  const problemasColumnas = (h: Hoja): string[] => {
    const usadas = (mapeos[h] || []).filter((c): c is string => !!c);
    const p: string[] = [];
    if (usadas.some((c, i) => usadas.indexOf(c) !== i)) p.push('Hay una columna asignada dos veces.');
    OBLIGATORIAS[h].filter(c => !usadas.includes(c)).forEach(c => p.push(`Falta la columna "${COLUMNAS_HOJA[h].find(x => x.clave === c)?.encabezado}".`));
    return p;
  };
  const columnasListas = hojasPresentes.every(h => problemasColumnas(h).length === 0);

  // ---------- Paso 3: revisión ----------
  const filasDe = (h: Hoja): (FilaEstructura | FilaAnalizada)[] =>
    !analisis ? [] : h === 'areas' ? analisis.areas : h === 'cargos' ? analisis.cargos : analisis.colaboradores.filas;
  const todas = hojasPresentes.flatMap(h => filasDe(h));
  const total = resumenAcciones(todas);
  const hayActualizaciones = total.actualizar > 0;
  const puedeAplicar = !!analisis && analisis.pendientes === 0 && total.crear + total.actualizar > 0 && (!hayActualizaciones || confirmaCambios);
  const aCrearColab = analisis?.colaboradores.filas.filter(f => f.accion === 'crear').length ?? 0;

  async function aplicar() {
    if (!analisis || !puedeAplicar) return;
    setOcupado('Aplicando cambios… no cierres esta ventana.');
    try {
      const r = await aplicarImportacion(libro, opciones, decisiones, {
        areas: analisis.areas.filter(filaValida).map(f => f.clave),
        cargos: analisis.cargos.filter(filaValida).map(f => f.clave),
        colaboradores: analisis.colaboradores.filas.filter(filaValida).map(f => f.email),
      });
      setResultado(r);
      setPaso('resultado');
      onAplicado(r.creadosIds, darAcceso && r.creadosIds.length > 0);
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(null); }
  }

  async function bajarErrores() {
    if (!archivo || !analisis) return;
    await descargarErrores(hojasPresentes.map(h => {
      const porNumero = new Map(archivo[h]!.filas.map(f => [f.numero, f.celdas]));
      return {
        nombre: NOMBRE_HOJA[h], encabezados: archivo[h]!.encabezados,
        filas: filasDe(h).filter(f => f.accion === 'error').map(f => ({ celdas: porNumero.get(f.numero) || [], errores: f.errores })),
      };
    }));
  }

  function decidir(id: string, destino: string) {
    setDecisiones(prev => ({ ...prev, [id]: destino }));
  }

  function cerrar() {
    if ((paso === 'columnas' || paso === 'revision') && !window.confirm('¿Salir sin aplicar la importación?')) return;
    onClose();
  }

  const indicePaso = PASOS.findIndex(p => p.id === paso);
  const visibles = filasDe(hojaActiva).filter(f => filtro === 'todas' || f.accion === filtro);
  const resumenHoja = resumenAcciones(filasDe(hojaActiva));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 md:p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-5xl h-full max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header + pasos */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">📥 Carga masiva</h3>
            <p className="text-[11px] text-slate-500">Áreas, cargos y colaboradores desde un solo Excel. Verás cada cambio antes de aplicarlo.</p>
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
          {ctxApi?.migracionPendiente && (
            <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Falta aplicar la migración <strong>20261119_cargos_estructura.sql</strong> en Supabase (SQL Editor). Hasta entonces no se puede aplicar la carga.
            </p>
          )}

          {/* ===== PASO 1 ===== */}
          {paso === 'inicio' && (
            <div className="space-y-5">
              <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {HOJAS.map((h, i) => (
                  <li key={h} className="border border-slate-200 rounded-2xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{i + 1} · {ICONO[h]} {NOMBRE_HOJA[h]}</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {h === 'areas' && 'Nombre, de qué área depende y su líder. Arma el organigrama.'}
                      {h === 'cargos' && 'Cada cargo con su área (obligatoria), nivel, descripción y rango salarial.'}
                      {h === 'colaboradores' && 'Cada persona con su cargo, área, jefe, contrato y salario.'}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">1 · Descarga la plantilla</p>
                  <p className="text-xs text-slate-600">
                    Trae tus áreas y cargos actuales precargados, listas desplegables enlazadas entre hojas y una hoja de instrucciones.
                  </p>
                  <button type="button" disabled={!!ocupado || !ctxApi} onClick={() => plantilla(true)}
                    className="w-full text-left p-3 rounded-xl border-2 border-slate-800 hover:bg-slate-50 disabled:opacity-50">
                    <span className="text-sm font-bold text-slate-800">⬇️ Con mis {activos.length} colaboradores actuales</span>
                    <span className="block text-[11px] text-slate-500">Para completar datos: llena lo que falta y vuelve a subirlo.</span>
                  </button>
                  <button type="button" disabled={!!ocupado || !ctxApi} onClick={() => plantilla(false)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                    <span className="text-sm font-bold text-slate-700">⬇️ Plantilla de carga inicial</span>
                    <span className="block text-[11px] text-slate-500">Hoja Colaboradores vacía, para registrar la organización desde cero.</span>
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
                    <span className="text-[11px] text-slate-500 text-center">.xlsx con hojas Áreas, Cargos y/o Colaboradores (o .csv de colaboradores) · hasta 1.000 filas por hoja</span>
                  </button>
                  <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => cargar(e.target.files?.[0])} />
                </div>
              </div>
            </div>
          )}

          {/* ===== PASO 2 ===== */}
          {paso === 'columnas' && archivo && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                <strong>{nombreArchivo}</strong> · Revisa a qué dato corresponde cada columna; reconocimos las que pudimos automáticamente.
              </p>
              <PestanasHoja hojas={hojasPresentes} activa={hojaActiva} onCambiar={setHojaActiva}
                etiqueta={h => `${archivo[h]!.filas.length} fila(s)`} alerta={h => problemasColumnas(h).length > 0} />
              {(() => {
                const h = hojaActiva;
                const hoja = archivo[h];
                if (!hoja) return null;
                const mapeo = mapeos[h] || [];
                const usadas = mapeo.filter((c): c is string => !!c);
                const duplicadas = usadas.filter((c, i) => usadas.indexOf(c) !== i);
                return (
                  <>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wider">
                          <tr><th className="text-left px-4 py-2">Columna del archivo</th><th className="text-left px-3 py-2">Ejemplo</th><th className="text-left px-4 py-2">Se carga como</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {hoja.encabezados.map((enc, i) => {
                            const clave = mapeo[i] ?? null;
                            const repetida = clave && duplicadas.includes(clave);
                            return (
                              <tr key={i} className={clave ? '' : 'bg-slate-50/50'}>
                                <td className="px-4 py-2 font-bold text-slate-800">{enc || <span className="italic text-slate-400">(sin título)</span>}</td>
                                <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{hoja.filas.find(f => f.celdas[i]?.trim())?.celdas[i] || '—'}</td>
                                <td className="px-4 py-2">
                                  <select
                                    value={clave ?? ''}
                                    onChange={e => setMapeos(prev => ({ ...prev, [h]: (prev[h] || []).map((c, j) => (j === i ? e.target.value || null : c)) }))}
                                    className={`text-xs border rounded-lg px-2 py-1.5 outline-none w-full max-w-[240px] ${repetida ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}
                                  >
                                    <option value="">— No importar —</option>
                                    {COLUMNAS_HOJA[h].map(c => <option key={c.clave} value={c.clave}>{c.encabezado}{OBLIGATORIAS[h].includes(c.clave) ? ' *' : ''}</option>)}
                                  </select>
                                  {repetida && <p className="text-[10px] text-red-600 mt-0.5">Esta columna está asignada dos veces.</p>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {problemasColumnas(h).map(p => <p key={p} className="text-xs font-semibold text-red-600">{p}</p>)}
                  </>
                );
              })()}
              {HOJAS.filter(h => !archivo[h]).length > 0 && (
                <p className="text-[11px] text-slate-500">No vienen en el archivo (se dejan como están): {HOJAS.filter(h => !archivo[h]).map(h => NOMBRE_HOJA[h]).join(', ')}.</p>
              )}
            </div>
          )}

          {/* ===== PASO 3 ===== */}
          {paso === 'revision' && analisis && (
            <div className="space-y-4">
              {analisis.parecidos.length > 0 && (
                <PanelParecidos parecidos={analisis.parecidos} pendientes={analisis.pendientes} onDecidir={decidir} />
              )}

              <PestanasHoja hojas={hojasPresentes} activa={hojaActiva} onCambiar={h => { setHojaActiva(h); setFiltro('todas'); }}
                etiqueta={h => { const r = resumenAcciones(filasDe(h)); return `${r.crear} nuevos · ${r.actualizar} cambios`; }}
                alerta={h => filasDe(h).some(f => f.accion === 'error')} />

              {/* Resumen de la hoja */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([['crear', 'Se crearán'], ['actualizar', 'Se actualizarán'], ['sin_cambios', 'Sin cambios'], ['error', 'Con errores']] as [AccionFila, string][]).map(([a, t]) => (
                  <button key={a} type="button" onClick={() => setFiltro(filtro === a ? 'todas' : a)}
                    className={`text-left p-3 rounded-xl border transition ${filtro === a ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTILO_ACCION[a].clase}`}>{ESTILO_ACCION[a].texto}</span>
                    <p className="text-2xl font-black text-slate-800 mt-1">{resumenHoja[a]}</p>
                    <p className="text-[11px] text-slate-500">{t}</p>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                {hojaActiva === 'colaboradores' && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-[#FF4C4C]" checked={opciones.crearPuestos} onChange={e => setOpciones(o => ({ ...o, crearPuestos: e.target.checked }))} />
                      Crear los cargos que no existen (en el área de cada colaborador){analisis.colaboradores.puestosNuevos.length > 0 && <strong> ({analisis.colaboradores.puestosNuevos.map(c => `${c.nombre} · ${c.areaNombre}`).join(', ')})</strong>}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-[#FF4C4C]" checked={opciones.crearAreas} onChange={e => setOpciones(o => ({ ...o, crearAreas: e.target.checked }))} />
                      Crear las áreas que no existen (como áreas principales){analisis.colaboradores.areasNuevas.length > 0 && <strong> ({analisis.colaboradores.areasNuevas.join(', ')})</strong>}
                    </label>
                  </>
                )}
                {hojaActiva === 'cargos' && analisis.nivelesNuevos.length > 0 && (
                  <span className="text-slate-600">Niveles nuevos que se agregarán al catálogo: <strong>{analisis.nivelesNuevos.join(', ')}</strong></span>
                )}
                {hojaActiva !== 'colaboradores' && !(hojaActiva === 'cargos' && analisis.nivelesNuevos.length > 0) && (
                  <span className="text-slate-500">Los nombres se comparan sin mayúsculas, tildes ni espacios de más: lo que ya existe se actualiza, nunca se duplica.</span>
                )}
                {todas.some(f => f.accion === 'error') && (
                  <button type="button" onClick={bajarErrores} className="ml-auto font-bold text-[#FF4C4C] hover:underline">⬇️ Descargar filas con errores para corregir</button>
                )}
              </div>

              {/* Filas */}
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {visibles.length === 0 && <p className="text-xs text-slate-400 italic p-4">No hay filas en este grupo.</p>}
                {visibles.slice(0, LIMITE_VISTA).map(f => (
                  <FilaRevision key={`${hojaActiva}-${f.numero}`} fila={f} hoja={hojaActiva} />
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
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-1">
                      <p className="text-lg font-black text-emerald-800">✓ Carga aplicada</p>
                      {resultado.areasAplicadas + resultado.cargosAplicados > 0 && (
                        <p className="text-sm text-emerald-900">🏢 {resultado.areasAplicadas} área(s) y 💼 {resultado.cargosAplicados} cargo(s) creados o actualizados.</p>
                      )}
                      <p className="text-sm text-emerald-900">
                        👥 {ok.filter(r => r.accion === 'crear').length} colaborador(es) creado(s) · {ok.filter(r => r.accion === 'actualizar').length} actualizado(s)
                        {fallidas.length > 0 && ` · ${fallidas.length} no se pudieron aplicar`}
                      </p>
                      {resultado.areasCreadas.length > 0 && <p className="text-xs text-emerald-800">Áreas nuevas: {resultado.areasCreadas.join(', ')}.</p>}
                      {resultado.puestosCreados.length > 0 && <p className="text-xs text-emerald-800">Cargos nuevos: {resultado.puestosCreados.join(', ')}.</p>}
                      {resultado.nivelesCreados.length > 0 && <p className="text-xs text-emerald-800">Niveles nuevos: {resultado.nivelesCreados.join(', ')}.</p>}
                      <p className="text-xs text-emerald-800">Los cambios de los colaboradores quedaron registrados en su historial.</p>
                    </div>
                    {resultado.avisosEstructura.length > 0 && (
                      <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-1">
                        {resultado.avisosEstructura.map((a, i) => <p key={i} className="text-xs text-amber-800">◐ {a}</p>)}
                      </div>
                    )}
                    {[...fallidas, ...conAvisos].length > 0 && (
                      <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                        {[...fallidas, ...conAvisos].map(r => (
                          <div key={r.numero} className="px-4 py-2.5 text-xs">
                            <span className={`font-bold ${r.ok ? 'text-amber-700' : 'text-red-700'}`}>{r.ok ? '◐' : '✕'} Colaboradores fila {r.numero} · {r.nombre || r.email}</span>
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
          <div className="text-[11px] text-slate-500 min-h-[1rem]">
            {ocupado || (paso === 'revision' && analisis && analisis.pendientes > 0 && (
              <span className="font-bold text-amber-700">Decide los {analisis.pendientes} posible(s) duplicado(s) para continuar.</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {paso === 'columnas' && (
              <>
                <button type="button" onClick={() => setPaso('inicio')} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">← Otro archivo</button>
                <button type="button" disabled={!columnasListas || !ctxApi} onClick={() => { setFiltro('todas'); setPaso('revision'); }}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl disabled:opacity-40">Revisar cambios →</button>
              </>
            )}
            {paso === 'revision' && analisis && (
              <>
                {hayActualizaciones && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <input type="checkbox" className="accent-blue-600" checked={confirmaCambios} onChange={e => setConfirmaCambios(e.target.checked)} />
                    Confirmo que se modificarán <strong>{total.actualizar}</strong> registro(s) existente(s)
                  </label>
                )}
                {aCrearColab > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="accent-[#FF4C4C]" checked={darAcceso} onChange={e => setDarAcceso(e.target.checked)} />
                    🔑 Dar acceso a los {aCrearColab} nuevo(s)
                  </label>
                )}
                <button type="button" onClick={() => setPaso('columnas')} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">← Columnas</button>
                <button type="button" disabled={!puedeAplicar || !!ocupado || !!ctxApi?.migracionPendiente} onClick={aplicar}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl disabled:opacity-40">
                  Aplicar ({total.crear} nuevos · {total.actualizar} actualizaciones)
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

// ------------------------------------------------------------------

function PestanasHoja({ hojas, activa, onCambiar, etiqueta, alerta }: {
  hojas: Hoja[]; activa: Hoja; onCambiar: (h: Hoja) => void; etiqueta: (h: Hoja) => string; alerta: (h: Hoja) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {hojas.map(h => (
        <button key={h} type="button" role="tab" aria-selected={activa === h} onClick={() => onCambiar(h)}
          className={`px-4 py-2 rounded-xl border text-left transition ${activa === h ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}>
          <span className="text-xs font-bold">{ICONO[h]} {NOMBRE_HOJA[h]}{alerta(h) && <span className="ml-1 text-red-400">●</span>}</span>
          <span className={`block text-[10px] ${activa === h ? 'text-slate-300' : 'text-slate-500'}`}>{etiqueta(h)}</span>
        </button>
      ))}
    </div>
  );
}

function PanelParecidos({ parecidos, pendientes, onDecidir }: { parecidos: Parecido[]; pendientes: number; onDecidir: (id: string, destino: string) => void }) {
  const usos = (p: Parecido) => (Object.entries(p.usos) as [Hoja, number[]][])
    .map(([h, filas]) => `${NOMBRE_HOJA[h]}: fila${filas.length > 1 ? 's' : ''} ${filas.slice(0, 5).join(', ')}${filas.length > 5 ? ` y ${filas.length - 5} más` : ''}`).join(' · ');
  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${pendientes > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/40'}`}>
      <div>
        <p className="text-sm font-black text-slate-800">🔎 Posibles duplicados {pendientes > 0 ? `(${pendientes} por decidir)` : '· todos decididos'}</p>
        <p className="text-[11px] text-slate-600">Estos nombres se parecen a otros. Unifícalos si son lo mismo, para no crear registros repetidos.</p>
      </div>
      <div className="space-y-2">
        {parecidos.map(p => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-2">
            <div className="md:w-72 shrink-0 min-w-0">
              <span className="text-[10px] font-bold uppercase text-slate-400">{TIPO_PARECIDO[p.tipo]}{p.ambito ? ` · en ${p.ambito}` : ''}</span>
              <p className="text-sm font-bold text-slate-800 truncate">«{p.nombre}»</p>
              <p className="text-[10px] text-slate-500 truncate" title={usos(p)}>{usos(p)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {p.candidatos.map(c => {
                const elegido = !!p.decision && normalizarNombre(p.decision) === normalizarNombre(c.nombre);
                return (
                  <button key={c.nombre + c.origen} type="button" onClick={() => onDecidir(p.id, c.nombre)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition ${elegido ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-200 hover:border-slate-400 text-slate-700'}`}>
                    Es «<strong>{c.nombre}</strong>» <span className={elegido ? 'text-slate-300' : 'text-slate-400'}>({c.origen === 'existente' ? 'ya existe' : 'en el archivo'})</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => onDecidir(p.id, '')}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition ${p.decision === '' ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-slate-200 hover:border-slate-400 text-slate-700'}`}>
                Es distinto: crear «{p.nombre}»
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilaRevision({ fila: f, hoja }: { fila: FilaEstructura | FilaAnalizada; hoja: Hoja }) {
  const esColab = hoja === 'colaboradores';
  const c = f as FilaAnalizada;
  const e = f as FilaEstructura;
  const titulo = esColab ? (c.datos?.nombre || c.nombre || '(sin nombre)') : (e.nombre || '(sin nombre)');
  const subtitulo = esColab ? `Fila ${f.numero} · ${c.email || 'sin email'}` : `Fila ${f.numero}${e.areaNombre ? ` · ${e.areaNombre}` : ''}`;
  const detalle = esColab
    ? [c.puestoNombre, c.areaNombre, c.datos?.tipo_perfil].filter(Boolean).join(' · ')
    : hoja === 'areas'
      ? [e.padreNombre !== undefined && `Depende de: ${e.padreNombre ?? 'Área principal'}`, e.liderEmail && `Líder: ${e.liderEmail}`].filter(Boolean).join(' · ')
      : [e.nivelNombre && `Nivel: ${e.nivelNombre}`, e.rango && `Rango: ${[e.rango.min, e.rango.max].map(v => (v === null ? '—' : v.toLocaleString('es-CO'))).join(' – ')} ${e.rango.moneda}`, e.descripcion && 'con descripción'].filter(Boolean).join(' · ');
  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="sm:w-64 shrink-0 min-w-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTILO_ACCION[f.accion].clase}`}>{ESTILO_ACCION[f.accion].texto}</span>
        <p className="text-sm font-bold text-slate-800 truncate mt-1">{titulo}</p>
        <p className="text-[10px] text-slate-500 truncate">{subtitulo}</p>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {f.errores.map((m, i) => <p key={i} className="text-[11px] text-red-700">✕ {m}</p>)}
        {(f.accion === 'actualizar' || f.accion === 'sin_cambios') && f.cambios.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {f.cambios.map((x, i) => (
              <span key={i} className="text-[10px] bg-blue-50 border border-blue-100 text-slate-700 px-2 py-0.5 rounded-full">
                <strong>{x.campo}:</strong> <span className="text-slate-400 line-through">{x.antes}</span> → {x.despues}
              </span>
            ))}
          </div>
        )}
        {f.accion === 'crear' && (
          <p className="text-[11px] text-slate-600">{detalle}{esColab && f.cambios.length > 0 && ` · ${f.cambios.map(x => `${x.campo}: ${x.despues}`).join(' · ')}`}</p>
        )}
        {f.advertencias.map((a, i) => <p key={i} className="text-[11px] text-amber-700">◐ {a}</p>)}
      </div>
    </div>
  );
}
