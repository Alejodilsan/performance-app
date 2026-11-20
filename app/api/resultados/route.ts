import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import { calcularProgreso, esClaveMes, etiquetaMes, puedeCalificar } from '@/lib/periodos'
import type { Indicador } from '@/lib/tipos'
import type { RespuestaResultado } from '@/lib/periodosApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * Califica (o borra) el resultado de un KPI en un mes.
 * Puede hacerlo el Admin o el líder de un reporte DIRECTO, mientras el mes no esté cerrado y, para los líderes,
 * dentro de la fecha límite (fin de mes + días configurados). Recalcula el progreso con la regla del dominio,
 * actualiza el valor vigente del KPI y el cumplimiento del colaborador, y registra el avance del mes.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await obtenerContextoSesion(request);
    if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
    if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
    const { admin, perfil, empresaId, activos, alcance, usuario } = ctx;

    const body = await request.json() as { indicador_id?: number; periodo?: string; resultado?: number | null };
    const indicadorId = Number(body.indicador_id);
    const periodo = body.periodo;
    if (!Number.isInteger(indicadorId) || !esClaveMes(periodo)) return errorJson('Datos incompletos.', 400);
    const borrar = body.resultado === null || body.resultado === undefined;
    const resultado = borrar ? 0 : Number(body.resultado);
    if (!borrar && (!Number.isFinite(resultado) || Math.abs(resultado) > 1e12)) return errorJson('El resultado no es un número válido.', 400);

    const { data: kpi } = await admin.from('indicadores').select('*').eq('id', indicadorId).maybeSingle<Indicador & { empleado_id: number }>();
    const emp = kpi ? activos.find(e => e.id === kpi.empleado_id) : undefined;
    if (!kpi || !emp) return errorJson('El indicador no existe o no pertenece a tu organización.', 404);

    const esAdmin = perfil.rol === 'admin';
    if (!esAdmin && !alcance.directosIds.includes(emp.id)) return errorJson('Solo puedes calificar a tus reportes directos.', 403);

    const [{ data: cerradosDB, error: eCerr }, { config }] = await Promise.all([
      admin.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId),
      leerConfiguracion(admin, empresaId),
    ]);
    if (eCerr) return errorJson('Falta aplicar la migración 20261121_periodos.sql en Supabase.', 500);
    const permiso = puedeCalificar(periodo, new Set((cerradosDB || []).map(p => p.periodo as string)), config.dias_limite_calificacion, esAdmin);
    if (!permiso.ok) return errorJson(permiso.motivo!, 409);

    const progreso = borrar ? 0 : calcularProgreso(kpi.direccion, kpi.meta_esperada, resultado);
    if (borrar) {
      const { error } = await admin.from('resultados_kpi').delete().eq('indicador_id', indicadorId).eq('periodo', periodo);
      if (error) throw error;
    } else {
      const { error } = await admin.from('resultados_kpi').upsert({
        indicador_id: indicadorId, empleado_id: emp.id, empresa_id: empresaId, periodo, resultado, progreso,
        registrado_por: usuario.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'indicador_id,periodo' });
      if (error) throw error;
    }

    const cumplimiento = await recalcularColaborador(admin, emp.id, indicadorId, empresaId, emp.potencial_score ?? null, periodo);
    const respuesta: RespuestaResultado = { progreso, ...cumplimiento };
    return NextResponse.json(respuesta);
  } catch (error) {
    const m = mensajeDeError(error);
    if (/está cerrado/.test(m)) return errorJson(m, 409);
    console.error('Error en /api/resultados:', error);
    return errorJson(`No se pudo guardar el resultado: ${m}`, 500);
  }
}

/**
 * El valor vigente del KPI es su resultado más reciente; el cumplimiento del colaborador (denormalizado en
 * empleados) es el promedio del progreso vigente de sus KPIs. Además se registra el avance del mes
 * (historico_cumplimiento con oficial = false; si el mes tiene cierre oficial, la BD lo conserva).
 */
async function recalcularColaborador(admin: SupabaseClient, empleadoId: number, indicadorId: number, empresaId: number, potencial: number | null, periodo: string) {
  const { data: ultimo } = await admin.from('resultados_kpi').select('resultado, progreso')
    .eq('indicador_id', indicadorId).order('periodo', { ascending: false }).limit(1).maybeSingle();
  await admin.from('indicadores').update({ resultado_actual: ultimo ? Number(ultimo.resultado) : 0, progreso: ultimo ? Number(ultimo.progreso) : 0 }).eq('id', indicadorId);

  const [{ data: kpis }, { data: delMes }] = await Promise.all([
    admin.from('indicadores').select('progreso').eq('empleado_id', empleadoId),
    admin.from('resultados_kpi').select('progreso').eq('empleado_id', empleadoId).eq('periodo', periodo),
  ]);
  const lista = kpis || [];
  const cumplimientoGeneral = lista.length ? Math.round(lista.reduce((s, k) => s + Number(k.progreso || 0), 0) / lista.length) : 0;
  await admin.from('empleados').update({ cumplimiento_general: cumplimientoGeneral }).eq('id', empleadoId);

  const mes = delMes || [];
  const cumplimientoPeriodo = mes.length ? Math.round(mes.reduce((s, r) => s + Number(r.progreso), 0) / mes.length) : null;
  if (cumplimientoPeriodo !== null) {
    await admin.from('historico_cumplimiento').upsert({
      empleado_id: empleadoId, empresa_id: empresaId, periodo: etiquetaMes(periodo), cumplimiento: cumplimientoPeriodo,
      potencial_score: potencial, total_kpis: lista.length, fecha_corte: new Date().toISOString(),
    }, { onConflict: 'empleado_id,periodo' });
  }
  return { cumplimiento_general: cumplimientoGeneral, cumplimiento_periodo: cumplimientoPeriodo };
}
