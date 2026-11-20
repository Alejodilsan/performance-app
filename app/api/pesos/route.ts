import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion } from '@/lib/servidor/contexto'
import { recalcularCumplimiento } from '@/lib/servidor/cumplimiento'
import { validarPesos } from '@/lib/periodos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Pesos de los KPIs de una persona (Admin o su líder directo). Se envían todos sus KPIs: todos vacíos
 * (pesan igual) o todos > 0 sumando 100. Luego se recalcula su cumplimiento.
 * POST { empleado_id, pesos: { [indicadorId]: number | null } }
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ctx = await obtenerContextoSesion(request);
    if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
    if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
    const { admin, perfil, alcance, activos, empresaId } = ctx;

    const body = await request.json() as { empleado_id?: number; pesos?: Record<string, number | null> };
    const emp = activos.find(e => e.id === Number(body.empleado_id));
    if (!emp) return errorJson('El colaborador no existe.', 404);
    if (perfil.rol !== 'admin' && !alcance.directosIds.includes(emp.id)) return errorJson('Solo puedes definir pesos para tus reportes directos.', 403);

    const { data: kpis, error } = await admin.from('indicadores').select('id').eq('empleado_id', emp.id);
    if (error) throw error;
    const ids = (kpis || []).map(k => k.id as number);
    const pesos = body.pesos || {};
    if (ids.some(id => !(String(id) in pesos)) || Object.keys(pesos).some(id => !ids.includes(Number(id)))) {
      return errorJson('Los KPIs cambiaron: recarga e inténtalo de nuevo.', 409);
    }
    const valores = ids.map(id => { const v = pesos[String(id)]; return v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100; });
    const invalido = validarPesos(valores);
    if (invalido) return errorJson(invalido, 400);

    for (let i = 0; i < ids.length; i++) {
      const { error: e } = await admin.from('indicadores').update({ peso: valores[i] }).eq('id', ids[i]);
      if (e) throw new Error(/peso/.test(e.message) ? 'Falta aplicar la migración 20261123_okr.sql en Supabase.' : e.message);
    }
    const r = await recalcularCumplimiento(admin, emp.id, empresaId, emp.potencial_score ?? null);
    return NextResponse.json(r);
  } catch (error) {
    console.error('Error en /api/pesos:', error);
    return errorJson(`No se pudieron guardar los pesos: ${mensajeDeError(error)}`, 500);
  }
}
