import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorJson, exigirAdmin } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion, porLotes } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import {
  CELDAS_TALENTO_CLAVE, aplicarFiltros, calcularRotacion, clasificarNineBox, costoEmpresa,
  mediana, mensualizar, nivelDesempeno, validarConfiguracion,
  type CeldaId, type ConfiguracionBI, type FiltrosBI, type SenalesSalariales,
} from '@/lib/bi'
import type { CostosBI, RespuestaBI, TotalCosto } from '@/lib/biApi'
import type { Compensacion, Empleado } from '@/lib/tipos'
import { calcularSenalesHistorial, type EventoHistorial, type SenalesHistorial } from '@/lib/historial'
import { mensajeDeError } from '@/lib/errores'

/**
 * Datos del módulo BI según el alcance del usuario (lib/alcance.ts).
 * Los costos se agregan AQUÍ: los líderes reciben solo totales; ningún salario individual sale del servidor
 * salvo para el Admin (señales de retención).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await obtenerContextoSesion(request);
    if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
    if (ctx.estado !== 'ok') return errorJson('No tienes acceso al módulo BI.', 403);
    const { admin, perfil, empresaId, areas, todos, activos, miBase, alcance } = ctx;
    const esAdmin = perfil.rol === 'admin';
    const esEmpresa = alcance.tipo === 'empresa';
    if (alcance.tipo === 'personal') return errorJson('El módulo BI está disponible para quienes tienen un equipo a cargo.', 403);

    const { config, porDefecto } = await leerConfiguracion(admin, empresaId);
    const filtros = filtrosDesdeUrl(new URL(request.url));

    // Población: toda la empresa (Admin/Auditor) o su equipo en cascada, con los filtros aplicados
    const equipo = new Set(alcance.equipoIds);
    const poblacion = aplicarFiltros(esEmpresa ? activos : activos.filter(e => equipo.has(e.id)), filtros, areas);
    const ids = poblacion.map(e => e.id);

    // ¿Quién tiene evaluación de potencial y quién tiene KPIs?
    const [potencialEvaluado, conKpis] = await Promise.all([
      idsConRegistros(admin, 'evaluaciones_potencial', ids).catch(() => new Set(poblacion.filter(e => e.potencial_score).map(e => e.id))),
      idsConRegistros(admin, 'indicadores', ids),
    ]);

    // ---------- Costos (Admin y líderes con equipo; nunca el Auditor) ----------
    const puedeVerCostos = esAdmin || alcance.tipo === 'equipo';
    let costos: CostosBI | null = null;
    let senalesSalariales: Record<number, SenalesSalariales> | null = null;

    if (puedeVerCostos) {
      // El Admin necesita los salarios de toda la empresa para comparar con la mediana de cada puesto
      const idsSalarios = esAdmin ? activos.map(e => e.id) : ids;
      const vigentes = await salariosVigentes(admin, idsSalarios);
      const baseMensual = (emp: Empleado) => {
        const c = vigentes.get(emp.id);
        return c ? { moneda: c.moneda, base: mensualizar(Number(c.salario), c.periodicidad, emp.jornada, config.horas_mes), comp: c } : null;
      };

      const vacio = (): TotalCosto => ({ personas: 0, base: 0, costoEmpresa: 0 });
      const sumar = (t: TotalCosto, base: number) => { t.personas++; t.base += base; t.costoEmpresa += costoEmpresa(base, config.factor_prestacional); };
      const total = vacio(), bajoDesempeno = vacio(), talentoClave = vacio();
      const porCelda: CostosBI['porCelda'] = {};
      const otras = new Map<string, { personas: number; base: number }>();
      const porArea = new Map<number | null, TotalCosto & { suma: number; headcount: number }>();
      let sinSalario = 0;

      poblacion.forEach(emp => {
        const fila = porArea.get(emp.area_id) ?? { ...vacio(), suma: 0, headcount: 0 };
        fila.headcount++; fila.suma += emp.cumplimiento_general || 0;
        porArea.set(emp.area_id, fila);

        const s = baseMensual(emp);
        if (!s) { sinSalario++; return; }
        if (s.moneda !== config.moneda_principal) {
          const o = otras.get(s.moneda) ?? { personas: 0, base: 0 };
          o.personas++; o.base += s.base; otras.set(s.moneda, o);
          return;
        }
        sumar(total, s.base);
        sumar(fila, s.base);
        const conIndicadores = { ...emp, indicadores: conKpis.has(emp.id) ? [{}] as Empleado['indicadores'] : [] };
        const clas = clasificarNineBox(conIndicadores, config, potencialEvaluado);
        const celda: CeldaId | 'sin_clasificar' = clas.estado === 'ok' ? clas.celda : 'sin_clasificar';
        sumar(porCelda[celda] ??= vacio(), s.base);
        if (conKpis.has(emp.id) && nivelDesempeno(emp.cumplimiento_general || 0, config) === 1) sumar(bajoDesempeno, s.base);
        if (clas.estado === 'ok' && CELDAS_TALENTO_CLAVE.includes(clas.celda)) sumar(talentoClave, s.base);
      });

      const nombreArea = new Map(areas.map(a => [a.id, a.nombre]));
      costos = {
        moneda: config.moneda_principal,
        factor: config.factor_prestacional,
        total, sinSalario, bajoDesempeno, talentoClave, porCelda,
        otrasMonedas: [...otras.entries()].map(([moneda, o]) => ({ moneda, ...o })),
        porArea: [...porArea.entries()].map(([areaId, f]) => ({
          areaId, nombre: areaId === null ? 'Sin área' : nombreArea.get(areaId) || 'Área',
          personas: f.personas, base: f.base, costoEmpresa: f.costoEmpresa, headcount: f.headcount,
          cumplimientoPromedio: f.headcount > 0 ? Math.round(f.suma / f.headcount) : 0,
        })).sort((a, b) => b.costoEmpresa - a.costoEmpresa),
      };

      // Señales salariales individuales: SOLO Admin
      if (esAdmin) {
        senalesSalariales = {};
        const basesPorPuesto = new Map<string, { id: number; base: number }[]>();
        activos.forEach(emp => {
          const s = baseMensual(emp);
          if (!s || s.moneda !== config.moneda_principal) return;
          const clave = emp.puesto_id ? `id:${emp.puesto_id}` : `n:${(emp.puesto || '').toLowerCase()}`;
          basesPorPuesto.set(clave, [...(basesPorPuesto.get(clave) || []), { id: emp.id, base: s.base }]);
        });
        const hoy = new Date();
        poblacion.forEach(emp => {
          const s = baseMensual(emp);
          if (!s) return;
          let bajoMedianaPct: number | null = null;
          if (s.moneda === config.moneda_principal) {
            const clave = emp.puesto_id ? `id:${emp.puesto_id}` : `n:${(emp.puesto || '').toLowerCase()}`;
            const pares = (basesPorPuesto.get(clave) || []).filter(p => p.id !== emp.id).map(p => p.base);
            const m = pares.length >= 2 ? mediana(pares) : null; // se necesitan al menos 2 pares para comparar
            if (m && m > 0 && s.base < m) bajoMedianaPct = ((m - s.base) / m) * 100;
          }
          const vigencia = new Date(s.comp.fecha_vigencia + 'T00:00:00');
          const meses = (hoy.getFullYear() - vigencia.getFullYear()) * 12 + (hoy.getMonth() - vigencia.getMonth());
          senalesSalariales![emp.id] = { bajoMedianaPct, mesesSinAjuste: Math.max(meses, 0) };
        });
      }
    }

    // ---------- Historial laboral → señales de riesgo (estancamiento, cambio de jefe, reubicaciones) ----------
    const senalesHistorial: Record<number, SenalesHistorial> = {};
    const eventos = await porLotes(ids, async lote => {
      const { data, error } = await admin.from('historial_empleado').select('empleado_id, tipo, valor_anterior, fecha')
        .in('empleado_id', lote).in('tipo', ['ingreso', 'puesto', 'jefe', 'area']);
      if (error) throw error;
      return (data || []) as Pick<EventoHistorial, 'empleado_id' | 'tipo' | 'valor_anterior' | 'fecha'>[];
    }).catch(() => null); // la tabla aún no existe: sin señales de historial
    const porEmpleado = new Map<number, Pick<EventoHistorial, 'tipo' | 'valor_anterior' | 'fecha'>[]>();
    (eventos || []).forEach(ev => porEmpleado.set(ev.empleado_id, [...(porEmpleado.get(ev.empleado_id) || []), ev]));
    poblacion.forEach(emp => { senalesHistorial[emp.id] = calcularSenalesHistorial(porEmpleado.get(emp.id) || [], emp.fecha_ingreso); });

    // ---------- Rotación (salidas del alcance, con los mismos filtros) ----------
    const areasAlcance = new Set(alcance.areasIds);
    const cadena = new Set([...alcance.equipoIds, ...(miBase ? [miBase.id] : [])]);
    const salidas = aplicarFiltros(
      todos.filter(e => e.estado_contratacion === 'desvinculado' && (esEmpresa ||
        (e.area_id !== null && areasAlcance.has(e.area_id)) || (e.jefe_directo_id != null && cadena.has(e.jefe_directo_id)))),
      filtros, areas,
    );
    const rotacion = calcularRotacion(salidas.map(e => ({ fecha: e.fecha_desvinculacion, motivo: e.motivo_desvinculacion })), poblacion.length);

    const respuesta: RespuestaBI = {
      config, configPorDefecto: porDefecto, puedeEditarConfig: esAdmin,
      potencialEvaluadoIds: [...potencialEvaluado], costos, senalesSalariales, senalesHistorial, rotacion,
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en /api/bi:', error);
    return errorJson(`No se pudo calcular el BI: ${mensajeDeError(error)}`, 500);
  }
}

/** Guarda la configuración del BI (solo Admin). */
export async function POST(request: Request) {
  const auth = await exigirAdmin(request);
  if (!auth.ok) return auth.respuesta;
  try {
    const body = await request.json() as { config?: Partial<ConfiguracionBI> };
    const c = body.config || {};
    const config: ConfiguracionBI = {
      moneda_principal: String(c.moneda_principal || '').toUpperCase(),
      factor_prestacional: Number(c.factor_prestacional),
      horas_mes: Number(c.horas_mes),
      umbral_desempeno_bajo: Math.round(Number(c.umbral_desempeno_bajo)),
      umbral_desempeno_alto: Math.round(Number(c.umbral_desempeno_alto)),
      dias_limite_calificacion: Math.round(Number(c.dias_limite_calificacion ?? 5)),
    };
    const invalida = validarConfiguracion(config);
    if (invalida) return errorJson(invalida, 400);
    const { error } = await auth.admin.from('configuracion_empresa')
      .upsert({ empresa_id: auth.perfil.empresa_id, ...config, updated_at: new Date().toISOString() });
    if (error) {
      const falta = /configuracion_empresa/.test(error.message);
      const faltaPeriodos = /dias_limite_calificacion/.test(error.message);
      return errorJson(faltaPeriodos ? 'Falta aplicar la migración 20261121_periodos.sql en Supabase.' : falta ? 'Falta aplicar la migración 20261117_configuracion_bi.sql en Supabase.' : error.message, 500);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorJson(`No se pudo guardar: ${mensajeDeError(error)}`, 500);
  }
}

// ------------------------------------------------------------------

function filtrosDesdeUrl(url: URL): FiltrosBI {
  const area = Number(url.searchParams.get('area'));
  return {
    areaId: Number.isFinite(area) && area > 0 ? area : null,
    sede: url.searchParams.get('sede') || null,
    contrato: url.searchParams.get('contrato') || null,
  };
}

/** IDs de colaboradores que tienen al menos un registro en la tabla indicada. */
async function idsConRegistros(admin: SupabaseClient, tabla: 'evaluaciones_potencial' | 'indicadores', ids: number[]): Promise<Set<number>> {
  const filas = await porLotes(ids, async lote => {
    const { data, error } = await admin.from(tabla).select('empleado_id').in('empleado_id', lote);
    if (error) throw error;
    return (data || []) as { empleado_id: number }[];
  });
  return new Set(filas.map(f => f.empleado_id));
}

/** Salario vigente (el de fecha de vigencia más reciente que ya empezó a regir) por colaborador. */
async function salariosVigentes(admin: SupabaseClient, ids: number[]): Promise<Map<number, Compensacion>> {
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = await porLotes(ids, async lote => {
    const { data, error } = await admin.from('compensaciones').select('*').in('empleado_id', lote).lte('fecha_vigencia', hoy)
      .order('fecha_vigencia', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Compensacion[];
  }).catch(() => [] as Compensacion[]);
  const vigentes = new Map<number, Compensacion>();
  filas.forEach(c => { if (!vigentes.has(c.empleado_id)) vigentes.set(c.empleado_id, c); });
  return vigentes;
}
