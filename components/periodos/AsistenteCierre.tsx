'use client'
// Cierre guiado de un período (solo Admin): 1) pendientes · 2) vista previa · 3) confirmar. Además, reapertura
// del último mes cerrado con motivo. El cálculo definitivo lo hace /api/periodos.
import { useMemo, useState } from 'react'
import type { Area, Empleado } from '@/lib/tipos'
import {
  claveMes, diasEntre, estadoPeriodo, etiquetaMes, fechaLimite, formatearFecha, resumenPeriodo, siguienteACerrar, sumarMeses,
} from '@/lib/periodos'
import { cerrarPeriodo, reabrirPeriodo } from '@/lib/periodosApi'
import { mensajeDeError } from '@/lib/errores'
import { coloresDesempeno, useUmbrales } from '@/lib/umbrales'

interface Props {
  empleados: Empleado[];
  areas: Area[];
  cerrados: string[];
  diasLimite: number;
  onClose: () => void;
  onCambio: () => void;
}

type Paso = 1 | 2 | 3;

export function AsistenteCierre({ empleados, areas, cerrados, diasLimite, onClose, onCambio }: Props) {
  const u = useUmbrales();
  const setCerrados = useMemo(() => new Set(cerrados), [cerrados]);
  const periodo = siguienteACerrar(setCerrados);
  const [paso, setPaso] = useState<Paso>(1);
  const [entiendo, setEntiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const ultimoCerrado = [...cerrados].sort().pop();

  const filas = useMemo(() => {
    if (!periodo) return [];
    const anterior = sumarMeses(periodo, -1);
    return empleados.filter(e => (e.indicadores || []).length > 0).map(e => {
      const r = resumenPeriodo(e, periodo);
      const previo = (e.historico || []).find(h => h.periodo === etiquetaMes(anterior) && h.oficial);
      return { emp: e, r, previo: previo ? Number(previo.cumplimiento) : null };
    }).sort((a, b) => b.r.pendientes.length - a.r.pendientes.length || a.emp.nombre.localeCompare(b.emp.nombre, 'es'));
  }, [empleados, periodo]);

  // Pendientes agrupados por jefe directo (a quién recordarle)
  const porJefe = useMemo(() => {
    const m = new Map<string, { jefe: string; personas: { nombre: string; kpis: string[] }[] }>();
    filas.filter(f => f.r.pendientes.length > 0).forEach(f => {
      const jefe = empleados.find(e => e.id === f.emp.jefe_directo_id)?.nombre
        ?? empleados.find(e => e.id === areas.find(a => a.id === f.emp.area_id)?.lider_id)?.nombre ?? 'Sin jefe asignado';
      const g = m.get(jefe) ?? { jefe, personas: [] };
      g.personas.push({ nombre: f.emp.nombre, kpis: f.r.pendientes.map(p => p.kpi.titulo) });
      m.set(jefe, g);
    });
    return [...m.values()].sort((a, b) => b.personas.length - a.personas.length);
  }, [filas, empleados, areas]);

  const totalPendientes = filas.reduce((s, f) => s + f.r.pendientes.length, 0);
  const sinResultados = filas.filter(f => f.r.cumplimiento === null);
  const conFoto = filas.filter(f => f.r.cumplimiento !== null);
  const promedio = conFoto.length ? Math.round(conFoto.reduce((s, f) => s + f.r.cumplimiento!, 0) / conFoto.length) : null;

  async function cerrar() {
    if (!periodo) return;
    setOcupado(true);
    try {
      const r = await cerrarPeriodo(periodo);
      setHecho(`${etiquetaMes(periodo)} quedó cerrado: ${r.registrados} persona(s) con cumplimiento registrado${r.sinResultados.length ? ` y ${r.sinResultados.length} sin resultados` : ''}.`);
      onCambio();
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(false); }
  }

  async function reabrir() {
    if (!ultimoCerrado) return;
    const motivo = window.prompt(`¿Por qué reabres ${etiquetaMes(ultimoCerrado)}? (queda registrado)`);
    if (motivo === null) return;
    setOcupado(true);
    try {
      await reabrirPeriodo(ultimoCerrado, motivo);
      setHecho(`${etiquetaMes(ultimoCerrado)} se reabrió. Los líderes pueden volver a calificarlo y luego debes cerrarlo de nuevo.`);
      onCambio();
    } catch (e) { alert(mensajeDeError(e)); }
    finally { setOcupado(false); }
  }

  const estado = periodo ? estadoPeriodo(periodo, setCerrados, diasLimite) : null;
  const limite = periodo ? fechaLimite(periodo, diasLimite) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marca-950/50 backdrop-blur-sm p-3 md:p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-marca-100 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-marca-900">🔒 Cierre de período</h3>
            <p className="text-[11px] text-slate-500">Los meses se cierran en orden. Un mes cerrado ya no cambia.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200" aria-label="Cerrar">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {hecho ? (
            <div className="bg-acento-50 border border-acento-200 rounded-2xl p-5">
              <p className="text-base font-bold text-acento-800">✓ Listo</p>
              <p className="text-sm text-acento-900 mt-1">{hecho}</p>
            </div>
          ) : !periodo ? (
            <div className="bg-marca-50 border border-marca-100 rounded-2xl p-5 text-sm text-marca-800">
              No hay meses por cerrar. <strong>{etiquetaMes(claveMes())}</strong> está en curso y se podrá cerrar desde el 1 de {etiquetaMes(sumarMeses(claveMes(), 1)).split(' ')[0].toLowerCase()}.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-marca-400">Período a cerrar</p>
                  <p className="font-titulo text-2xl font-extrabold text-marca-900">{etiquetaMes(periodo)}</p>
                  {limite && (
                    <p className={`text-xs mt-0.5 ${estado === 'vencido' ? 'text-marca-500' : 'text-amber-700 font-semibold'}`}>
                      {estado === 'vencido'
                        ? `Fecha límite para calificar: ${formatearFecha(limite)} (vencida)`
                        : `Los líderes aún pueden calificar hasta el ${formatearFecha(limite)} (${diasEntre(new Date(), limite)} día(s)).`}
                    </p>
                  )}
                </div>
                <ol className="flex items-center gap-1.5 text-[11px] font-bold" aria-label="Pasos">
                  {['Pendientes', 'Vista previa', 'Confirmar'].map((t, i) => (
                    <li key={t} className={`flex items-center gap-1.5 ${i + 1 <= paso ? 'text-marca-900' : 'text-slate-400'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i + 1 < paso ? 'bg-acento-600 text-white' : i + 1 === paso ? 'bg-marca-900 text-white' : 'bg-slate-100'}`}>{i + 1 < paso ? '✓' : i + 1}</span>
                      {t}{i < 2 && <span className="text-slate-300">›</span>}
                    </li>
                  ))}
                </ol>
              </div>

              {paso === 1 && (
                totalPendientes === 0 ? (
                  <p className="text-sm text-acento-800 bg-acento-50 border border-acento-200 rounded-2xl p-4">✓ Todos los KPIs de {etiquetaMes(periodo)} están calificados.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      Hay <strong>{totalPendientes} KPI(s) sin calificar</strong> en {etiquetaMes(periodo)}. Si cierras igual, no cuentan en el cumplimiento del mes
                      {estado !== 'vencido' && ' — conviene esperar a la fecha límite o recordárselo a los líderes'}.
                    </p>
                    <div className="border border-marca-100 rounded-2xl divide-y divide-marca-50">
                      {porJefe.map(g => (
                        <div key={g.jefe} className="px-4 py-3">
                          <p className="text-sm font-bold text-marca-900">{g.jefe} <span className="text-xs font-normal text-slate-500">· {g.personas.length} persona(s)</span></p>
                          <ul className="mt-1 space-y-0.5">
                            {g.personas.map(p => (
                              <li key={p.nombre} className="text-xs text-slate-600"><strong className="text-slate-700">{p.nombre}:</strong> {p.kpis.join(', ')}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              {paso === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-marca-700">
                    Se registrará el cumplimiento de <strong>{etiquetaMes(periodo)}</strong> de {conFoto.length} persona(s){promedio !== null && <> · promedio <strong>{promedio}%</strong></>}.
                    {sinResultados.length > 0 && <> {sinResultados.length} sin ningún resultado quedan fuera.</>}
                  </p>
                  <div className="border border-marca-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-marca-50 text-[10px] uppercase text-marca-400 tracking-wider">
                        <tr><th className="text-left px-4 py-2">Colaborador</th><th className="text-right px-3 py-2">Calificados</th><th className="text-right px-3 py-2">Mes anterior</th><th className="text-right px-4 py-2">{etiquetaMes(periodo)}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-marca-50">
                        {filas.map(({ emp, r, previo }) => (
                          <tr key={emp.id}>
                            <td className="px-4 py-2 font-semibold text-marca-900">{emp.nombre}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.calificados} / {r.calificados + r.pendientes.length}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{previo === null ? '—' : `${previo}%`}</td>
                            <td className={`px-4 py-2 text-right font-bold ${r.cumplimiento === null ? 'text-slate-400' : coloresDesempeno(r.cumplimiento, u).texto}`}>
                              {r.cumplimiento === null ? 'sin resultados' : `${r.cumplimiento}%`}
                              {r.cumplimiento !== null && previo !== null && (
                                <span className={`ml-1 text-[10px] ${r.cumplimiento >= previo ? 'text-acento-600' : 'text-amber-600'}`}>{r.cumplimiento >= previo ? '▲' : '▼'}{Math.abs(r.cumplimiento - previo)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {paso === 3 && (
                <div className="space-y-3">
                  <ul className="text-sm text-marca-800 bg-marca-50 border border-marca-100 rounded-2xl p-4 space-y-1.5 list-disc pl-8">
                    <li>Se registra el cumplimiento oficial de {etiquetaMes(periodo)} para {conFoto.length} persona(s).</li>
                    <li>Los resultados de {etiquetaMes(periodo)} quedan bloqueados: nadie podrá modificarlos.</li>
                    {totalPendientes > 0 && <li>{totalPendientes} KPI(s) sin calificar quedan sin resultado en este mes.</li>}
                    <li>Solo el Admin podrá reabrirlo, indicando el motivo.</li>
                  </ul>
                  <label className="flex items-center gap-2 text-sm text-marca-900 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-acento-600" checked={entiendo} onChange={e => setEntiendo(e.target.checked)} />
                    Entiendo que {etiquetaMes(periodo)} quedará cerrado.
                  </label>
                </div>
              )}
            </>
          )}

          {ultimoCerrado && !hecho && (
            <div className="pt-2 border-t border-marca-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Último mes cerrado: <strong className="text-marca-800">{etiquetaMes(ultimoCerrado)}</strong> · {cerrados.length} cerrado(s) en total</span>
              <button type="button" onClick={reabrir} disabled={ocupado} className="font-bold text-amber-700 hover:underline disabled:opacity-40">Reabrir {etiquetaMes(ultimoCerrado)}…</button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-marca-100 flex justify-end gap-2 shrink-0">
          {hecho || !periodo ? (
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 rounded-xl">Listo</button>
          ) : (
            <>
              {paso > 1 && <button type="button" onClick={() => setPaso((paso - 1) as Paso)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">← Atrás</button>}
              {paso < 3 ? (
                <button type="button" onClick={() => setPaso((paso + 1) as Paso)} className="px-5 py-2 text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 rounded-xl">
                  {paso === 1 && totalPendientes > 0 ? 'Continuar igual →' : 'Siguiente →'}
                </button>
              ) : (
                <button type="button" onClick={cerrar} disabled={!entiendo || ocupado} className="px-5 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-xl disabled:opacity-40">
                  {ocupado ? 'Cerrando…' : `🔒 Cerrar ${etiquetaMes(periodo)}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
