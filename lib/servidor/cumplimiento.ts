// ⚠️ Solo servidor. Recalcula el cumplimiento de una persona con los pesos de sus KPIs.
import type { SupabaseClient } from '@supabase/supabase-js'
import { claveMes, etiquetaMes, pesosEfectivos, promedioPonderado } from '@/lib/periodos'

/** El valor vigente de un KPI es su resultado más reciente. */
export async function refrescarKpiVigente(admin: SupabaseClient, indicadorId: number) {
  const { data: ultimo } = await admin.from('resultados_kpi').select('resultado, progreso')
    .eq('indicador_id', indicadorId).order('periodo', { ascending: false }).limit(1).maybeSingle();
  await admin.from('indicadores').update({ resultado_actual: ultimo ? Number(ultimo.resultado) : 0, progreso: ultimo ? Number(ultimo.progreso) : 0 }).eq('id', indicadorId);
}

/**
 * cumplimiento_general (denormalizado en empleados) = promedio ponderado del progreso vigente de TODOS sus KPIs.
 * Cumplimiento del mes = promedio ponderado de los KPIs CALIFICADOS en ese mes; se registra como avance en
 * historico_cumplimiento (oficial = false; si el mes tiene cierre oficial, la BD lo conserva).
 */
export async function recalcularCumplimiento(admin: SupabaseClient, empleadoId: number, empresaId: number, potencial: number | null, periodo: string = claveMes()) {
  const [{ data: kpis }, { data: delMes }] = await Promise.all([
    admin.from('indicadores').select('id, progreso, peso').eq('empleado_id', empleadoId),
    admin.from('resultados_kpi').select('indicador_id, progreso').eq('empleado_id', empleadoId).eq('periodo', periodo),
  ]);
  const lista = (kpis || []) as { id: number; progreso: number | null; peso: number | null }[];
  const pesos = pesosEfectivos(lista);
  const cumplimientoGeneral = promedioPonderado(lista.map(k => ({ progreso: Number(k.progreso || 0), peso: pesos.get(k.id) ?? 0 }))) ?? 0;
  await admin.from('empleados').update({ cumplimiento_general: cumplimientoGeneral }).eq('id', empleadoId);

  const mes = (delMes || []) as { indicador_id: number; progreso: number }[];
  const cumplimientoPeriodo = promedioPonderado(mes.map(r => ({ progreso: Number(r.progreso), peso: pesos.get(r.indicador_id) ?? 0 })));
  if (cumplimientoPeriodo !== null) {
    await admin.from('historico_cumplimiento').upsert({
      empleado_id: empleadoId, empresa_id: empresaId, periodo: etiquetaMes(periodo), cumplimiento: cumplimientoPeriodo,
      potencial_score: potencial, total_kpis: lista.length, fecha_corte: new Date().toISOString(),
    }, { onConflict: 'empleado_id,periodo' });
  }
  return { cumplimiento_general: cumplimientoGeneral, cumplimiento_periodo: cumplimientoPeriodo };
}
