'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { TIPOS_CONTRATO, type Area, type Empleado, type TipoContrato } from '@/lib/tipos'
import {
  CELDAS_TALENTO_CLAVE, FILTROS_VACIOS, aplicarFiltros, clasificarNineBox, formatearCompacto, nivelDesempeno,
  nivelRiesgo, senalesRetencion, type ConfiguracionBI, type FiltrosBI,
} from '@/lib/bi'
import { cargarBI, type RespuestaBI } from '@/lib/biApi'
import { mensajeDeError } from '@/lib/errores'
import { NineBox } from './NineBox'
import { TalentoEnRiesgo } from './TalentoEnRiesgo'
import { EficienciaCosto } from './EficienciaCosto'
import { EstructuraRotacion } from './EstructuraRotacion'
import { ModalConfiguracionBI } from './ModalConfiguracionBI'
import { CalidadDatos } from './CalidadDatos'

interface Props {
  /** Personas que este usuario puede ver (ya filtradas por su alcance, sin incluirse si no es Admin/Auditor) */
  empleados: Empleado[];
  /** Áreas de su alcance (opciones del filtro) */
  areasAlcance: Area[];
  /** Todas las áreas (para nombres y sub-áreas) */
  areas: Area[];
  etiquetaAlcance: string;
  onVerFicha: (emp: Empleado) => void;
  onConfiguracionGuardada: (c: ConfiguracionBI) => void;
  /** Solo Admin: abre el asistente de importación para completar datos */
  onAbrirImportacion?: () => void;
}

export function PanelBI({ empleados, areasAlcance, areas, etiquetaAlcance, onVerFicha, onConfiguracionGuardada, onAbrirImportacion }: Props) {
  const [filtros, setFiltros] = useState<FiltrosBI>(FILTROS_VACIOS);
  const [bi, setBi] = useState<RespuestaBI | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [version, setVersion] = useState(0); // fuerza recarga tras guardar la configuración

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      try {
        const datos = await cargarBI(filtros);
        if (vigente) { setBi(datos); setError(null); }
      } catch (e) {
        if (vigente) setError(mensajeDeError(e));
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [filtros, version]);

  // Los mismos filtros que aplica el servidor, sobre las fichas que ya tiene el navegador
  const filtrados = useMemo(() => aplicarFiltros(empleados, filtros, areas), [empleados, filtros, areas]);
  const sedes = useMemo(() => [...new Set(empleados.map(e => e.sede?.trim()).filter((s): s is string => !!s))].sort(), [empleados]);
  const contratos = useMemo(() => [...new Set(empleados.map(e => e.tipo_contrato).filter((c): c is TipoContrato => !!c))], [empleados]);
  const potencialEvaluado = useMemo(() => new Set(bi?.potencialEvaluadoIds ?? []), [bi]);

  const resumen = useMemo(() => {
    if (!bi) return null;
    const conKpis = filtrados.filter(e => e.indicadores && e.indicadores.length > 0);
    const promedio = conKpis.length ? Math.round(conKpis.reduce((s, e) => s + e.cumplimiento_general, 0) / conKpis.length) : 0;
    let clasificados = 0, clave = 0, claveEnRiesgo = 0;
    filtrados.forEach(emp => {
      const c = clasificarNineBox(emp, bi.config, potencialEvaluado);
      if (c.estado !== 'ok') return;
      clasificados++;
      if (!CELDAS_TALENTO_CLAVE.includes(c.celda)) return;
      clave++;
      if (nivelRiesgo(senalesRetencion(emp, bi.senalesSalariales?.[emp.id], bi.senalesHistorial?.[emp.id]))) claveEnRiesgo++;
    });
    const bajos = conKpis.filter(e => nivelDesempeno(e.cumplimiento_general, bi.config) === 1).length;
    return { promedio, conKpis: conKpis.length, clasificados, clave, claveEnRiesgo, bajos };
  }, [bi, filtrados, potencialEvaluado]);

  const hayFiltros = filtros.areaId !== null || !!filtros.sede || !!filtros.contrato;
  const selectCls = 'text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 outline-none focus:border-[#FF4C4C]';

  return (
    <div className="animate-in fade-in space-y-6">
      {/* Filtros: una sola fila sobre todos los gráficos */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <span className="text-[11px] font-bold text-slate-500 mr-1">{etiquetaAlcance}</span>
        <select className={selectCls} value={filtros.areaId ?? ''} aria-label="Filtrar por área"
          onChange={e => setFiltros(f => ({ ...f, areaId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Todas las áreas</option>
          {areasAlcance.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className={selectCls} value={filtros.sede ?? ''} aria-label="Filtrar por sede" disabled={sedes.length === 0}
          onChange={e => setFiltros(f => ({ ...f, sede: e.target.value || null }))}>
          <option value="">Todas las sedes</option>
          {sedes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={filtros.contrato ?? ''} aria-label="Filtrar por tipo de contrato" disabled={contratos.length === 0}
          onChange={e => setFiltros(f => ({ ...f, contrato: e.target.value || null }))}>
          <option value="">Todos los contratos</option>
          {contratos.map(c => <option key={c} value={c}>{TIPOS_CONTRATO[c]}</option>)}
        </select>
        {hayFiltros && <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)} className="text-xs font-bold text-[#FF4C4C] hover:underline">Limpiar</button>}
        <div className="ml-auto flex items-center gap-2">
          {cargando && <span className="text-[11px] text-slate-400">Actualizando…</span>}
          {bi?.puedeEditarConfig && (
            <button type="button" onClick={() => setConfigAbierta(true)} className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100">
              ⚙️ Configurar
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-4 py-3">No se pudo cargar el BI: {error}</div>}
      {bi?.configPorDefecto && bi.puedeEditarConfig && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3">
          Se están usando valores por defecto (COP, factor 1,52, umbrales 60/85). Aplica la migración <code>20261117_configuracion_bi.sql</code> para poder guardarlos.
        </div>
      )}

      {!bi || !resumen ? (
        !error && <p className="text-center text-sm text-slate-400 py-16">Calculando indicadores…</p>
      ) : (
        <>
          {/* Indicadores principales */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Indicador titulo="Cumplimiento promedio" valor={`${resumen.promedio}%`} detalle={`${resumen.conKpis} de ${filtrados.length} con KPIs`} destacado />
            <Indicador titulo="Headcount" valor={String(filtrados.length)} detalle={`${resumen.bajos} en bajo desempeño`} />
            <Indicador titulo="Talento clave" valor={String(resumen.clave)}
              detalle={resumen.claveEnRiesgo > 0 ? `! ${resumen.claveEnRiesgo} con riesgo de fuga` : 'Sin señales de riesgo'}
              alerta={resumen.claveEnRiesgo > 0} />
            {bi.costos ? (
              <>
                <Indicador titulo="Costo empresa / mes" valor={formatearCompacto(bi.costos.total.costoEmpresa, bi.costos.moneda)}
                  detalle={`Base ${formatearCompacto(bi.costos.total.base, bi.costos.moneda)} · ${bi.costos.sinSalario} sin salario`} />
                <Indicador titulo="Costo del bajo desempeño" valor={formatearCompacto(bi.costos.bajoDesempeno.costoEmpresa, bi.costos.moneda)}
                  detalle={`${porcentaje(bi.costos.bajoDesempeno.costoEmpresa, bi.costos.total.costoEmpresa)} de la nómina`}
                  alerta={bi.costos.bajoDesempeno.costoEmpresa > 0} />
              </>
            ) : (
              <>
                <Indicador titulo="Clasificados en Nine Box" valor={String(resumen.clasificados)} detalle={`de ${filtrados.length} personas`} />
                <Indicador titulo="Sin evaluar potencial" valor={String(filtrados.filter(e => !potencialEvaluado.has(e.id)).length)} detalle="pendientes de evaluación" />
              </>
            )}
            <Indicador titulo="Rotación 12 meses" valor={`${bi.rotacion.tasa12.toLocaleString('es-CO')}%`} detalle={`${bi.rotacion.ultimos12} salida(s)`} />
          </div>
          {bi.costos && bi.costos.otrasMonedas.length > 0 && (
            <p className="text-[11px] text-slate-500 -mt-3">
              Además: {bi.costos.otrasMonedas.map(o => `${o.personas} persona(s) en ${o.moneda} (${formatearCompacto(o.base, o.moneda)} base/mes)`).join(' · ')}, no incluidas en los totales.
            </p>
          )}

          <NineBox empleados={filtrados} areas={areas} config={bi.config} potencialEvaluado={potencialEvaluado} costos={bi.costos} onVerFicha={onVerFicha} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TalentoEnRiesgo empleados={filtrados} areas={areas} config={bi.config} potencialEvaluado={potencialEvaluado}
              senalesSalariales={bi.senalesSalariales} senalesHistorial={bi.senalesHistorial ?? {}} onVerFicha={onVerFicha} />
            <EficienciaCosto empleados={filtrados} areas={areas} config={bi.config} costos={bi.costos} />
          </div>

          <EstructuraRotacion empleados={filtrados} rotacion={bi.rotacion} />

          <CalidadDatos empleados={filtrados} potencialEvaluado={potencialEvaluado} costos={bi.costos} onCompletar={onAbrirImportacion} />
        </>
      )}

      {configAbierta && bi && (
        <ModalConfiguracionBI
          config={bi.config}
          onClose={() => setConfigAbierta(false)}
          onGuardada={c => { onConfiguracionGuardada(c); setVersion(v => v + 1); }}
        />
      )}
    </div>
  );
}

function Indicador({ titulo, valor, detalle, destacado, alerta }: { titulo: string; valor: string; detalle?: ReactNode; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border shadow-sm ${destacado ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${destacado ? 'text-slate-400' : 'text-slate-400'}`}>{titulo}</p>
      <p className={`text-2xl font-black mt-1 ${destacado ? 'text-white' : 'text-slate-800'}`}>{valor}</p>
      {detalle && <p className={`text-[11px] mt-0.5 ${alerta ? 'text-red-700 font-semibold' : destacado ? 'text-slate-300' : 'text-slate-500'}`}>{detalle}</p>}
    </div>
  );
}

const porcentaje = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '0%');
