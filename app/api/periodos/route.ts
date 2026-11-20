import { NextResponse } from 'next/server'
import { exigirAdmin, errorJson } from '@/lib/servidor/supabaseAdmin'
import { claveMes, esClaveMes, etiquetaMes, resumenPeriodo, siguienteACerrar } from '@/lib/periodos'
import { estaActivo, type Empleado } from '@/lib/tipos'
import type { RespuestaCierre } from '@/lib/periodosApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * Cierre y reapertura de períodos (solo Admin).
 *  cerrar  → solo el mes abierto más antiguo que ya terminó. La foto oficial (historico_cumplimiento, oficial = true)
 *            se calcula AQUÍ con los resultados de ese mes; luego el mes queda bloqueado (periodos_cerrados).
 *  reabrir → solo el último mes cerrado, con motivo (queda en periodos_reaperturas). La foto vuelve a ser "avance".
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await exigirAdmin(request);
  if (!auth.ok) return auth.respuesta;
  const { admin, perfil, usuario } = auth;
  const empresaId = perfil.empresa_id;

  try {
    const body = await request.json() as { accion?: 'cerrar' | 'reabrir'; periodo?: string; motivo?: string };
    const periodo = body.periodo;
    if (!esClaveMes(periodo)) return errorJson('Período no válido.', 400);

    const { data: cerradosDB, error: eCerr } = await admin.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId);
    if (eCerr) return errorJson('Falta aplicar la migración 20261121_periodos.sql en Supabase.', 500);
    const cerrados = new Set((cerradosDB || []).map(p => p.periodo as string));
    const etiqueta = etiquetaMes(periodo);

    if (body.accion === 'cerrar') {
      if (cerrados.has(periodo)) return errorJson(`${etiqueta} ya está cerrado.`, 409);
      if (periodo >= claveMes()) return errorJson(`${etiqueta} aún no termina: se puede cerrar desde el primer día del mes siguiente.`, 409);
      const siguiente = siguienteACerrar(cerrados);
      if (siguiente !== periodo) return errorJson(`Los meses se cierran en orden: primero ${siguiente ? etiquetaMes(siguiente) : 'el mes anterior'}.`, 409);

      // Foto del período con los resultados de ese mes (KPIs sin resultado no cuentan; quien no tiene ninguno queda fuera)
      const { data, error } = await admin.from('empleados')
        .select('id, nombre, potencial_score, estado_contratacion, indicadores(*, resultados:resultados_kpi(*))')
        .eq('empresa_id', empresaId);
      if (error) throw error;
      const activos = ((data || []) as unknown as Empleado[]).filter(estaActivo);
      const fecha = new Date().toISOString();
      const fotos: Record<string, unknown>[] = [];
      const sinResultados: string[] = [];
      let pendientes = 0;
      activos.forEach(emp => {
        const r = resumenPeriodo(emp, periodo);
        pendientes += r.pendientes.length;
        if (r.cumplimiento === null) { if ((emp.indicadores || []).length > 0) sinResultados.push(emp.nombre); return; }
        fotos.push({
          empleado_id: emp.id, empresa_id: empresaId, periodo: etiqueta, cumplimiento: r.cumplimiento,
          potencial_score: emp.potencial_score ?? null, total_kpis: r.calificados, fecha_corte: fecha, oficial: true,
        });
      });
      if (fotos.length > 0) {
        const { error: eFoto } = await admin.from('historico_cumplimiento').upsert(fotos, { onConflict: 'empleado_id,periodo' });
        if (eFoto) throw eFoto;
      }
      const { error: eCierre } = await admin.from('periodos_cerrados').insert({ empresa_id: empresaId, periodo, cerrado_por: usuario.id });
      if (eCierre) throw eCierre;
      const respuesta: RespuestaCierre = { periodo, registrados: fotos.length, sinResultados, pendientes };
      return NextResponse.json(respuesta);
    }

    if (body.accion === 'reabrir') {
      const motivo = (body.motivo || '').trim();
      if (motivo.length < 5) return errorJson('Escribe el motivo de la reapertura (queda registrado).', 400);
      const ultimo = [...cerrados].sort().pop();
      if (ultimo !== periodo) return errorJson(`Solo se puede reabrir el último mes cerrado${ultimo ? ` (${etiquetaMes(ultimo)})` : ''}.`, 409);

      // La foto oficial vuelve a ser "avance": se borra y se reinserta con oficial = false (las oficiales no se editan)
      const { data: oficiales, error: eLeer } = await admin.from('historico_cumplimiento').select('*')
        .eq('empresa_id', empresaId).eq('periodo', etiqueta).eq('oficial', true);
      if (eLeer) throw eLeer;
      const { error: eLog } = await admin.from('periodos_reaperturas').insert({ empresa_id: empresaId, periodo, motivo, reabierto_por: usuario.id });
      if (eLog) throw eLog;
      if ((oficiales || []).length > 0) {
        const { error: eDel } = await admin.from('historico_cumplimiento').delete().eq('empresa_id', empresaId).eq('periodo', etiqueta).eq('oficial', true);
        if (eDel) throw eDel;
        const avance = (oficiales || []).map(h => { const copia: Record<string, unknown> = { ...h, oficial: false }; delete copia.id; return copia; });
        const { error: eIns } = await admin.from('historico_cumplimiento').insert(avance);
        if (eIns) throw eIns;
      }
      const { error: eAbrir } = await admin.from('periodos_cerrados').delete().eq('empresa_id', empresaId).eq('periodo', periodo);
      if (eAbrir) throw eAbrir;
      return NextResponse.json({ ok: true });
    }

    return errorJson('Acción no válida.', 400);
  } catch (error) {
    console.error('Error en /api/periodos:', error);
    return errorJson(`No se pudo completar: ${mensajeDeError(error)}`, 500);
  }
}
