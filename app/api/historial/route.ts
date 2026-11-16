import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion } from '@/lib/servidor/contexto'
import type { EventoHistorial } from '@/lib/historial'
import type { RespuestaHistorial } from '@/lib/historialApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * GET /api/historial?empleado=ID → historial laboral de un colaborador.
 * Puede consultarlo: el Admin/Auditor (toda la empresa), su líder en la cascada, o la propia persona.
 * Los ajustes salariales solo se envían al Admin.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await obtenerContextoSesion(request);
    if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
    if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
    const { admin, perfil, empresaId, todos, miBase, alcance } = ctx;

    const empleadoId = Number(new URL(request.url).searchParams.get('empleado'));
    const emp = todos.find(e => e.id === empleadoId);
    if (!emp) return errorJson('Colaborador no encontrado.', 404);

    const esAdmin = perfil.rol === 'admin';
    const puedeVer =
      esAdmin ||
      (perfil.rol === 'auditor' && emp.estado_contratacion !== 'desvinculado') ||
      alcance.equipoIds.includes(emp.id) ||
      miBase?.id === emp.id;
    if (!puedeVer) return errorJson('No tienes acceso al historial de este colaborador.', 403);

    let consulta = admin.from('historial_empleado')
      .select('id, empleado_id, tipo, valor_anterior, valor_nuevo, detalle, fecha, created_at')
      .eq('empleado_id', emp.id).eq('empresa_id', empresaId)
      .order('fecha', { ascending: false }).order('id', { ascending: false });
    if (!esAdmin) consulta = consulta.neq('tipo', 'salario');

    const { data, error } = await consulta;
    if (error) {
      if (/historial_empleado/.test(error.message)) {
        return NextResponse.json({ estado: 'migracion_pendiente' } satisfies RespuestaHistorial);
      }
      throw error;
    }
    return NextResponse.json({ estado: 'ok', eventos: (data || []) as EventoHistorial[], incluyeSalarios: esAdmin } satisfies RespuestaHistorial);
  } catch (error) {
    console.error('Error en /api/historial:', error);
    return errorJson(`No se pudo cargar el historial: ${mensajeDeError(error)}`, 500);
  }
}
