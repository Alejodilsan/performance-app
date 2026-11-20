import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import { calcularProgreso, esClaveMes, puedeCalificar } from '@/lib/periodos'
import { recalcularCumplimiento, refrescarKpiVigente } from '@/lib/servidor/cumplimiento'
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

    await refrescarKpiVigente(admin, indicadorId);
    const cumplimiento = await recalcularCumplimiento(admin, emp.id, empresaId, emp.potencial_score ?? null, periodo);
    const respuesta: RespuestaResultado = { progreso, ...cumplimiento };
    return NextResponse.json(respuesta);
  } catch (error) {
    const m = mensajeDeError(error);
    if (/está cerrado/.test(m)) return errorJson(m, 409);
    console.error('Error en /api/resultados:', error);
    return errorJson(`No se pudo guardar el resultado: ${m}`, 500);
  }
}
