// ⚠️ Solo servidor. Configuración del BI por empresa (tabla configuracion_empresa, migración 20261117).
import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFIG_BI_DEFECTO, type ConfiguracionBI } from '@/lib/bi'

/** Devuelve la configuración guardada o la de por defecto. porDefecto = true si la tabla aún no existe. */
export async function leerConfiguracion(admin: SupabaseClient, empresaId: number): Promise<{ config: ConfiguracionBI; porDefecto: boolean }> {
  const { data, error } = await admin.from('configuracion_empresa').select('*').eq('empresa_id', empresaId).maybeSingle();
  if (error || !data) return { config: CONFIG_BI_DEFECTO, porDefecto: !!error };
  return {
    porDefecto: false,
    config: {
      moneda_principal: data.moneda_principal || CONFIG_BI_DEFECTO.moneda_principal,
      factor_prestacional: Number(data.factor_prestacional) || CONFIG_BI_DEFECTO.factor_prestacional,
      horas_mes: Number(data.horas_mes) || CONFIG_BI_DEFECTO.horas_mes,
      umbral_desempeno_bajo: Number(data.umbral_desempeno_bajo) || CONFIG_BI_DEFECTO.umbral_desempeno_bajo,
      umbral_desempeno_alto: Number(data.umbral_desempeno_alto) || CONFIG_BI_DEFECTO.umbral_desempeno_alto,
    },
  };
}
