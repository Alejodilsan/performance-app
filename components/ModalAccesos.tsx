'use client'
import { useMemo, useState } from 'react'
import type { Empleado } from '@/lib/tipos'
import { ETIQUETA_ESTADO_ACCESO, type ResultadoOtorgar } from '@/lib/accesos'
import { mensajeDeError } from '@/lib/errores'

interface Props {
  candidatos: Empleado[];
  onClose: () => void;
  onOtorgar: (empleadoIds: number[]) => Promise<ResultadoOtorgar>;
  /** Si viene, el modal abre directamente en el paso de credenciales (p. ej. tras crear un colaborador con acceso). */
  resultadoInicial?: ResultadoOtorgar;
}

type Filtro = 'sin_invitar' | 'invitado' | 'activo' | 'todos';

export function ModalAccesos({ candidatos, onClose, onOtorgar, resultadoInicial }: Props) {
  const [filtro, setFiltro] = useState<Filtro>(candidatos.some(e => estadoDe(e) === 'sin_invitar') ? 'sin_invitar' : 'todos');
  // Por defecto: los que todavía no tienen acceso
  const [seleccion, setSeleccion] = useState<number[]>(candidatos.filter(e => estadoDe(e) === 'sin_invitar').map(e => e.id));
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoOtorgar | null>(resultadoInicial ?? null);
  const [guardadas, setGuardadas] = useState(false); // ¿el admin ya copió o descargó las claves?
  const [copiadoId, setCopiadoId] = useState<number | 'todas' | null>(null);

  const conteo = useMemo(() => ({
    sin_invitar: candidatos.filter(e => estadoDe(e) === 'sin_invitar').length,
    invitado: candidatos.filter(e => estadoDe(e) === 'invitado').length,
    activo: candidatos.filter(e => estadoDe(e) === 'activo').length,
    todos: candidatos.length,
  }), [candidatos]);

  const visibles = candidatos.filter(e => filtro === 'todos' || estadoDe(e) === filtro);
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every(e => seleccion.includes(e.id));
  const seleccionConAcceso = candidatos.filter(e => seleccion.includes(e.id) && estadoDe(e) !== 'sin_invitar').length;

  const toggle = (id: number) => setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleVisibles = () => setSeleccion(prev =>
    todosVisiblesMarcados ? prev.filter(id => !visibles.some(v => v.id === id)) : [...new Set([...prev, ...visibles.map(v => v.id)])]
  );

  async function confirmar() {
    if (seleccion.length === 0) return;
    if (seleccionConAcceso > 0 && !window.confirm(
      `${seleccionConAcceso} de los seleccionados ya tienen acceso.\n\nSe les generará una NUEVA clave temporal y la anterior dejará de funcionar. ¿Continuar?`
    )) return;
    setProcesando(true);
    try {
      setResultado(await onOtorgar(seleccion));
    } catch (e) {
      alert(mensajeDeError(e, 'No se pudo completar la operación.'));
    } finally {
      setProcesando(false);
    }
  }

  const urlAcceso = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';

  async function copiar(texto: string, id: number | 'todas') {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setGuardadas(true);
      setTimeout(() => setCopiadoId(null), 1500);
    } catch {
      alert('No se pudo copiar automáticamente. Usa "Descargar".');
    }
  }

  function descargarCsv() {
    if (!resultado) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const filas = [
      ['Nombre', 'Correo', 'Clave temporal', 'Ingreso'],
      ...resultado.otorgados.map(o => [o.nombre, o.email, o.clave_temporal, urlAcceso]),
    ];
    // BOM para que Excel respete tildes y ñ
    const csv = '﻿' + filas.map(f => f.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Accesos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setGuardadas(true);
  }

  function cerrar() {
    if (resultado && resultado.otorgados.length > 0 && !guardadas &&
      !window.confirm('Las claves temporales no se volverán a mostrar.\n\n¿Cerrar sin copiarlas ni descargarlas?')) return;
    onClose();
  }

  const textoCredencial = (o: { nombre: string; email: string; clave_temporal: string }) =>
    `${o.nombre}\nIngreso: ${urlAcceso}\nUsuario: ${o.email}\nClave temporal: ${o.clave_temporal}\n(Se te pedirá crear tu propia contraseña al entrar)`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] border border-slate-100 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-marca-900">{resultado ? 'Accesos generados' : 'Dar acceso a la plataforma'}</h3>
            <p className="text-xs text-slate-500">
              {resultado
                ? 'Comparte estas credenciales de forma privada con cada colaborador.'
                : 'Se genera una clave temporal única por persona; al entrar deberá crear su propia contraseña.'}
            </p>
          </div>
          <button onClick={cerrar} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 flex items-center justify-center transition" aria-label="Cerrar">✕</button>
        </div>

        {!resultado ? (
          <>
            {/* Filtros por estado */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2 items-center justify-between shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {([['sin_invitar', 'Sin acceso'], ['invitado', 'Clave temporal'], ['activo', 'Activos'], ['todos', 'Todos']] as [Filtro, string][]).map(([f, txt]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltro(f)}
                    className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${filtro === f ? 'bg-marca-900 text-white border-marca-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {txt} ({conteo[f]})
                  </button>
                ))}
              </div>
              <button onClick={toggleVisibles} disabled={visibles.length === 0} className="text-xs font-bold text-acento-700 hover:underline disabled:opacity-40">
                {todosVisiblesMarcados ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
              </button>
            </div>

            {/* Lista */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {visibles.length === 0 ? (
                <p className="text-center text-sm text-slate-400 italic py-8">No hay colaboradores en este estado.</p>
              ) : (
                <div className="space-y-2.5">
                  {visibles.map(emp => {
                    const marcado = seleccion.includes(emp.id);
                    const estado = ETIQUETA_ESTADO_ACCESO[estadoDe(emp)];
                    return (
                      <label key={emp.id} className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all ${marcado ? 'bg-acento-50/60 border-acento-400/60 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <input type="checkbox" checked={marcado} onChange={() => toggle(emp.id)} className="w-4 h-4 ml-1 accent-acento-600 cursor-pointer" />
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {emp.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-marca-900 truncate">{emp.nombre}</p>
                          <p className="text-xs text-slate-500 truncate">{emp.email} • {emp.tipo_perfil || 'Empleado'}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${estado.clase}`}>{estado.texto}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-wrap gap-3 justify-between items-center shrink-0">
              <span className="text-sm font-bold text-slate-600">
                <span className="text-acento-700">{seleccion.length}</span> seleccionados
                {seleccionConAcceso > 0 && <span className="block text-[11px] font-medium text-amber-700">{seleccionConAcceso} ya tienen acceso: se les restablecerá la clave</span>}
              </span>
              <div className="flex gap-3">
                <button onClick={cerrar} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
                <button
                  onClick={confirmar}
                  disabled={procesando || seleccion.length === 0}
                  className="bg-acento-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-acento-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {procesando ? 'Generando...' : `Generar accesos (${seleccion.length})`}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
              {resultado.otorgados.length > 0 && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    🔐 <strong>Estas claves solo se muestran ahora.</strong> Cópialas o descárgalas antes de cerrar. Si se pierden, genera un acceso nuevo.
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wider">
                        <tr>
                          <th className="text-left font-bold px-4 py-2">Colaborador</th>
                          <th className="text-left font-bold px-3 py-2">Clave temporal</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resultado.otorgados.map(o => (
                          <tr key={o.empleado_id}>
                            <td className="px-4 py-2.5">
                              <p className="font-bold text-marca-900">{o.nombre} {o.cuenta_nueva ? '' : <span className="text-[10px] font-medium text-slate-400">(clave restablecida)</span>}</p>
                              <p className="text-[10px] text-slate-500">{o.email}</p>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-sm text-marca-900 select-all">{o.clave_temporal}</td>
                            <td className="px-4 py-2.5 text-right">
                              <button type="button" onClick={() => copiar(textoCredencial(o), o.empleado_id)} className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100">
                                {copiadoId === o.empleado_id ? '✓ Copiado' : 'Copiar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {resultado.errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 space-y-1">
                  <p className="font-bold">No se pudo dar acceso a {resultado.errores.length} colaborador(es):</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {resultado.errores.map(e => <li key={e.empleado_id}><strong>{e.nombre}</strong>: {e.mensaje}</li>)}
                  </ul>
                </div>
              )}

              {resultado.otorgados.length === 0 && resultado.errores.length === 0 && (
                <p className="text-center text-sm text-slate-400 italic py-8">No se generó ningún acceso.</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-wrap gap-3 justify-between items-center shrink-0">
              <span className="text-sm font-bold text-emerald-700">✅ {resultado.otorgados.length} acceso(s) generado(s)</span>
              <div className="flex gap-2">
                {resultado.otorgados.length > 0 && (
                  <>
                    <button type="button" onClick={() => copiar(resultado.otorgados.map(textoCredencial).join('\n\n'), 'todas')} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-slate-50">
                      {copiadoId === 'todas' ? '✓ Copiadas' : 'Copiar todas'}
                    </button>
                    <button type="button" onClick={descargarCsv} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-slate-50">
                      ⬇️ Descargar
                    </button>
                  </>
                )}
                <button type="button" onClick={cerrar} className="bg-marca-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-marca-800">Listo</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function estadoDe(emp: Empleado): 'sin_invitar' | 'invitado' | 'activo' {
  return emp.estado_acceso || 'sin_invitar';
}
