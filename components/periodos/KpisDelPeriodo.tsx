'use client'
// KPIs de un colaborador en un período (mes): los que se evalúan ese mes y los que solo registran avance.
import { useState } from 'react'
import type { Empleado } from '@/lib/tipos'
import {
  FRECUENCIAS, claveMes, estadoPeriodo, pesosEfectivos, validarPesos, etiquetaMes, etiquetaMesCorta, fechaLimite, formatearFecha, frecuenciaDe,
  mesesAbiertos, puedeCalificar, resumenPeriodo, type KpiEnPeriodo,
} from '@/lib/periodos'
import type { InfoPeriodos } from '@/lib/datos'
import type { OpcionKr } from '@/lib/okr'
import { coloresDesempeno, useUmbrales } from '@/lib/umbrales'

interface Props {
  emp: Empleado;
  /** Puede editar a esta persona (reporte directo o Admin) */
  allowEdit: boolean;
  esAdmin: boolean;
  periodos: InfoPeriodos;
  calificar: (indicadorId: number, eid: number, periodo: string, valor: number | null) => Promise<boolean>;
  eliminar: (indicadorId: number) => void;
  guardarFeedback?: (kpiId: number, eid: number, feedback: string) => void;
  /** KR del área a los que puede aportar un KPI, y cómo vincularlo */
  opcionesKr?: OpcionKr[];
  vincular?: (kpiId: number, krId: number | null) => Promise<void>;
  /** false si los OKR no están disponibles (p. ej. falta la migración): no se muestra el vínculo */
  hayOkr?: boolean;
  /** Guarda los pesos de todos los KPIs de la persona (todos null = pesan igual) */
  guardarPesos?: (eid: number, pesos: Record<number, number | null>) => Promise<boolean>;
}

export function KpisDelPeriodo({ emp, allowEdit, esAdmin, periodos, calificar, eliminar, guardarFeedback, opcionesKr = [], vincular, hayOkr = false, guardarPesos }: Props) {
  const [editandoPesos, setEditandoPesos] = useState(false);
  const todos = emp.indicadores || [];
  const conPeso = todos.some(k => k.peso != null);
  const pesos = pesosEfectivos(todos);
  const cerrados = new Set(periodos.cerrados);
  const actual = claveMes();
  // Pestañas: último mes cerrado (solo lectura), meses abiertos y siempre el mes en curso
  const ultimoCerrado = [...cerrados].filter(c => c <= actual).sort().pop();
  const pestanas = [...new Set([...(ultimoCerrado ? [ultimoCerrado] : []), ...mesesAbiertos(cerrados), actual])].sort();
  const [periodo, setPeriodo] = useState(actual);
  const r = resumenPeriodo(emp, periodo);
  const permiso = puedeCalificar(periodo, cerrados, periodos.diasLimite, esAdmin);
  const editable = allowEdit && periodos.disponible && permiso.ok;
  const estado = estadoPeriodo(periodo, cerrados, periodos.diasLimite);
  const u = useUmbrales();
  const total = r.calificados + r.pendientes.length;

  return (
    <div className="space-y-3">
      {/* Período */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-marca-50 p-1 rounded-xl" role="tablist" aria-label="Período">
          {pestanas.map(m => {
            const pend = cerrados.has(m) ? 0 : resumenPeriodo(emp, m).pendientes.length;
            return (
              <button key={m} type="button" role="tab" aria-selected={periodo === m} onClick={() => setPeriodo(m)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${periodo === m ? 'bg-white text-marca-900 shadow-sm' : 'text-marca-500 hover:text-marca-900'}`}>
                {cerrados.has(m) ? '🔒' : '📅'} {m === actual ? etiquetaMes(m) : etiquetaMesCorta(m)}
                {pend > 0 && m !== actual && <span className="ml-1 text-amber-600">· {pend}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-xs font-bold text-marca-700 flex items-center gap-2">
          {allowEdit && guardarPesos && hayOkr && todos.length > 1 && (
            <button type="button" onClick={() => setEditandoPesos(!editandoPesos)}
              className="text-[11px] font-bold text-marca-600 bg-white border border-marca-100 hover:bg-marca-50 rounded-lg px-2 py-0.5" title="Peso de cada KPI en el cumplimiento">
              ⚖️ Pesos{conPeso ? '' : ' (iguales)'}
            </button>
          )}
          <span>Cumplimiento {etiquetaMesCorta(periodo)}:{' '}
          <span className={r.cumplimiento === null ? 'text-slate-400' : coloresDesempeno(r.cumplimiento, u).texto}>{r.cumplimiento === null ? '—' : `${r.cumplimiento}%`}</span>
          <span className="font-normal text-slate-500"> · {r.calificados}/{total} calificados</span></span>
        </span>
      </div>

      {conPeso && todos.some(k => k.peso == null) && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          ⚖️ {todos.filter(k => k.peso == null).map(k => `"${k.titulo}"`).join(', ')} no tiene peso{allowEdit ? ': ajusta los pesos para que cuente en el cumplimiento.' : ' asignado.'}
        </p>
      )}
      {editandoPesos && guardarPesos && (
        <EditorPesos kpis={todos} onCancelar={() => setEditandoPesos(false)}
          onGuardar={async v => { const ok = await guardarPesos(emp.id, v); if (ok) setEditandoPesos(false); }} />
      )}

      {allowEdit && !editable && periodos.disponible && permiso.motivo && (
        <p className="text-[11px] text-marca-600 bg-marca-50 border border-marca-100 rounded-xl px-3 py-2">🔒 {permiso.motivo}</p>
      )}
      {editable && estado === 'por_calificar' && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          ⏰ Calificas {etiquetaMes(periodo)} hasta el {formatearFecha(fechaLimite(periodo, periodos.diasLimite))}.
        </p>
      )}

      <Grupo titulo={`Se evalúan en ${etiquetaMes(periodo)}`} vacio="Ningún KPI cierra su evaluación este mes." kpis={r.seEvaluan}
        {...{ emp, editable, allowEdit, periodo, calificar, eliminar, guardarFeedback, opcionesKr, vincular, hayOkr, pesos: conPeso ? pesos : null }} />
      {r.enAvance.length > 0 && (
        <Grupo titulo="Avance · se evalúan al cierre de su ventana" kpis={r.enAvance}
          {...{ emp, editable, allowEdit, periodo, calificar, eliminar, guardarFeedback, opcionesKr, vincular, hayOkr, pesos: conPeso ? pesos : null }} />
      )}
      {total === 0 && (
        <p className="text-xs text-slate-400 italic text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">
          Aún no hay indicadores. {allowEdit ? 'Agrega el primero abajo.' : 'Tu líder los definirá contigo.'}
        </p>
      )}
    </div>
  );
}

interface PropsGrupo {
  titulo: string; vacio?: string; kpis: KpiEnPeriodo[]; emp: Empleado; editable: boolean; allowEdit: boolean; periodo: string;
  calificar: Props['calificar']; eliminar: Props['eliminar']; guardarFeedback: Props['guardarFeedback'];
  opcionesKr: OpcionKr[]; vincular: Props['vincular']; hayOkr: boolean;
  /** Peso efectivo por KPI (null = sin pesos definidos: todos iguales, no se muestra) */
  pesos: Map<number, number> | null;
}

function Grupo({ titulo, vacio, kpis, ...resto }: PropsGrupo) {
  if (kpis.length === 0 && !vacio) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-marca-400">{titulo}</p>
      {kpis.length === 0 ? <p className="text-[11px] text-slate-400 italic">{vacio}</p> : kpis.map(k => <FilaKpi key={`${k.kpi.id}-${resto.periodo}-${k.resultado?.updated_at ?? ''}-${k.resultado?.resultado ?? ''}`} k={k} {...resto} />)}
    </div>
  );
}

function FilaKpi({ k, emp, editable, allowEdit, periodo, calificar, eliminar, guardarFeedback, opcionesKr, vincular, hayOkr, pesos }: Omit<PropsGrupo, 'titulo' | 'vacio' | 'kpis'> & { k: KpiEnPeriodo }) {
  const u = useUmbrales();
  const { kpi, ventana, resultado, anterior } = k;
  const valorGuardado = resultado ? String(Number(resultado.resultado)) : '';
  const [valor, setValor] = useState(valorGuardado);
  const [guardando, setGuardando] = useState(false);
  const progreso = resultado ? Math.round(Number(resultado.progreso)) : null;
  const frecuencia = frecuenciaDe(kpi);

  async function confirmar() {
    const limpio = valor.trim().replace(',', '.');
    if (limpio === valorGuardado) return;
    const numero = limpio === '' ? null : Number(limpio);
    if (numero !== null && !Number.isFinite(numero)) { setValor(valorGuardado); return; }
    setGuardando(true);
    const ok = await calificar(kpi.id, emp.id, periodo, numero);
    setGuardando(false);
    if (!ok) setValor(valorGuardado);
  }

  return (
    <div className={`bg-white p-4 rounded-xl border shadow-sm relative ${progreso === null ? 'border-dashed border-amber-300' : 'border-slate-200'}`}>
      {allowEdit && (
        <button type="button" onClick={() => eliminar(kpi.id)} title="Eliminar KPI"
          className="absolute top-2 right-2 text-red-300 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors text-xs font-bold">🗑️</button>
      )}
      <div className="pr-10">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-marca-900 truncate" title={kpi.titulo}>{kpi.titulo}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {FRECUENCIAS[frecuencia]}
              {ventana.totalMeses > 1 && <> · {ventana.etiqueta} · mes {ventana.mesEnVentana} de {ventana.totalMeses}</>}
              {ventana.totalMeses > 1 && ventana.seEvalua && <span className="ml-1 font-bold text-acento-700">· se evalúa este mes</span>}
              {pesos && <span className="ml-1 font-bold text-marca-700">· peso {Math.round((pesos.get(kpi.id) ?? 0) * 10) / 10}%</span>}
            </p>
          </div>
          {progreso === null
            ? <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">Pendiente</span>
            : <span className={`font-titulo text-lg font-extrabold shrink-0 ${coloresDesempeno(progreso, u).texto}`}>{progreso}%</span>}
        </div>
        {kpi.descripcion && <p className="text-[11px] text-slate-500 mt-1 leading-tight">{kpi.descripcion}</p>}
        {hayOkr && (
          allowEdit && vincular ? (
            <select aria-label="Resultado clave al que aporta"
              className={`mt-2 max-w-full text-[10px] font-semibold rounded-full px-2 py-1 border outline-none ${kpi.kr_id ? 'bg-acento-50 border-acento-200 text-acento-800' : 'bg-slate-50 border-dashed border-slate-300 text-slate-500'}`}
              value={kpi.kr_id ?? ''} onChange={e => vincular(kpi.id, e.target.value ? Number(e.target.value) : null)}>
              <option value="">⚙️ Operativo · vincular a un OKR…</option>
              {kpi.kr_id && !opcionesKr.some(o => o.id === kpi.kr_id) && <option value={kpi.kr_id}>🎯 Resultado clave de otro año o área</option>}
              {opcionesKr.map(o => <option key={o.id} value={o.id}>🎯 {o.etiqueta}</option>)}
            </select>
          ) : (
            <p className={`mt-2 inline-block text-[10px] font-semibold rounded-full px-2 py-1 border ${kpi.kr_id ? 'bg-acento-50 border-acento-200 text-acento-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              {kpi.kr_id ? `🎯 ${opcionesKr.find(o => o.id === kpi.kr_id)?.etiqueta ?? 'Aporta a un OKR'}` : '⚙️ Operativo'}
            </p>
          )
        )}
      </div>

      <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-3">
        <div className="flex-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Meta{kpi.direccion === 'decreciente' ? ' (máximo)' : ''}</span>
          <span className="text-sm font-bold text-marca-900">{kpi.meta_esperada || 0} <span className="text-xs font-normal text-slate-500">{kpi.unidad_medida || 'Und.'}</span></span>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="flex-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            {ventana.totalMeses > 1 && !ventana.seEvalua ? 'Avance' : 'Resultado'} {etiquetaMesCorta(periodo)}
          </span>
          {editable ? (
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" aria-label={`Resultado de ${kpi.titulo} en ${etiquetaMes(periodo)}`}
                className="w-24 p-1.5 text-xs bg-white border border-slate-300 rounded focus:border-acento-500 outline-none text-marca-900 font-bold disabled:opacity-50"
                value={valor} placeholder="—" disabled={guardando}
                onChange={e => setValor(e.target.value)} onBlur={confirmar}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setValor(valorGuardado); }} />
              <span className="text-xs text-slate-500">{kpi.unidad_medida}</span>
            </div>
          ) : (
            <span className="text-sm font-bold text-marca-900">{resultado ? Number(resultado.resultado) : '—'} <span className="text-xs font-normal text-slate-500">{kpi.unidad_medida}</span></span>
          )}
        </div>
      </div>
      {anterior && (
        <p className="text-[10px] text-slate-400 mt-1.5">{etiquetaMes(anterior.periodo)}: {Number(anterior.resultado)} {kpi.unidad_medida} ({Math.round(Number(anterior.progreso))}%)</p>
      )}

      <div className="h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full transition-all duration-700 ${progreso === null ? '' : progreso >= 100 ? 'bg-acento-500' : coloresDesempeno(progreso, u).barra}`} style={{ width: `${progreso ?? 0}%` }} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Feedback del proceso (Líder)</label>
        {allowEdit ? (
          <textarea
            className="w-full text-[10px] bg-slate-50/50 border border-slate-200 rounded p-2 text-slate-600 outline-none focus:border-slate-400 resize-none min-h-[40px]"
            placeholder="Añade observaciones sobre el avance de este KPI..."
            defaultValue={kpi.feedback_lider || ''}
            onBlur={e => { if (e.target.value !== (kpi.feedback_lider || '')) guardarFeedback?.(kpi.id, emp.id, e.target.value); }}
          />
        ) : (
          <p className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 italic">{kpi.feedback_lider || 'Aún no hay retroalimentación registrada.'}</p>
        )}
      </div>
    </div>
  );
}

function EditorPesos({ kpis, onGuardar, onCancelar }: {
  kpis: { id: number; titulo: string; peso?: number | null }[];
  onGuardar: (pesos: Record<number, number | null>) => Promise<void>;
  onCancelar: () => void;
}) {
  const inicial = Object.fromEntries(kpis.map(k => [k.id, k.peso != null ? String(Number(k.peso)) : '']));
  const [valores, setValores] = useState<Record<number, string>>(inicial);
  const [guardando, setGuardando] = useState(false);
  const numeros = kpis.map(k => { const v = (valores[k.id] ?? '').trim().replace(',', '.'); return v === '' ? null : Number(v); });
  const suma = numeros.reduce((s: number, v) => s + (v ?? 0), 0);
  const error = validarPesos(numeros);
  const repartir = () => {
    const base = Math.floor((100 / kpis.length) * 10) / 10;
    setValores(Object.fromEntries(kpis.map((k, i) => [k.id, String(i === kpis.length - 1 ? Math.round((100 - base * (kpis.length - 1)) * 10) / 10 : base)])));
  };
  async function guardar() {
    if (error) return;
    setGuardando(true);
    await onGuardar(Object.fromEntries(kpis.map((k, i) => [k.id, numeros[i]])));
    setGuardando(false);
  }
  return (
    <div className="bg-white border-2 border-marca-900 rounded-xl p-3 space-y-2">
      <p className="text-[11px] font-bold text-marca-900">⚖️ Peso de cada KPI en el cumplimiento</p>
      {kpis.map(k => (
        <label key={k.id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate text-slate-700" title={k.titulo}>{k.titulo}</span>
          <input inputMode="decimal" className="w-16 text-right text-xs font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-acento-500"
            value={valores[k.id] ?? ''} placeholder="—" onChange={e => setValores(v => ({ ...v, [k.id]: e.target.value }))} />
          <span className="text-slate-400">%</span>
        </label>
      ))}
      <div className="flex items-center justify-between text-[11px]">
        <span className={Math.abs(suma - 100) <= 0.5 ? 'font-bold text-acento-700' : 'font-bold text-amber-700'}>Suma: {Math.round(suma * 10) / 10}%</span>
        <span className="flex gap-2">
          <button type="button" onClick={repartir} className="font-bold text-marca-600 hover:underline">Repartir igual</button>
          <button type="button" onClick={() => setValores(Object.fromEntries(kpis.map(k => [k.id, ''])))} className="font-bold text-slate-500 hover:underline">Quitar pesos</button>
        </span>
      </div>
      {error && numeros.some(n => n !== null) && <p className="text-[10px] text-amber-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
        <button type="button" onClick={guardar} disabled={!!error || guardando} className="px-3 py-1.5 text-[11px] font-bold text-white bg-acento-600 hover:bg-acento-700 rounded-lg disabled:opacity-40">
          {guardando ? 'Guardando…' : numeros.every(n => n === null) ? 'Guardar (pesos iguales)' : 'Guardar pesos'}
        </button>
      </div>
    </div>
  );
}
