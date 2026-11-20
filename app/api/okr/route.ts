import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion, porLotes, type ContextoSesion } from '@/lib/servidor/contexto'
import {
  calcularAvance, progresoKpiEnTrimestre, puedeGestionarNivel, validarAlineacion, validarKr,
  type KpiDeKr, type ObjetivoOKR, type ResultadoClave, type TipoMedicion,
} from '@/lib/okr'
import type { ResultadoKpi } from '@/lib/periodos'
import type { RespuestaOKR } from '@/lib/okrApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * OKR (todos los ven: transparencia). El avance se calcula aquí porque depende de los KPIs de toda la empresa;
 * el detalle de cada KPI (persona y resultado) solo se envía si la persona está en el alcance de quien consulta.
 *  GET  ?anio=2026&trimestre=4
 *  POST { accion: crear_objetivo | editar_objetivo | eliminar_objetivo | crear_kr | editar_kr | eliminar_kr | actualizar_kr, ... }
 *       Empresa: solo Admin. Área: Admin o el líder del área.
 */
export const dynamic = 'force-dynamic';

type Ok = Extract<ContextoSesion, { estado: 'ok' }>;

async function contexto(request: Request): Promise<Ok | NextResponse> {
  const ctx = await obtenerContextoSesion(request);
  if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
  if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
  return ctx;
}

async function cargarOkr(ctx: Ok, anio: number) {
  const { admin, empresaId } = ctx;
  const { data: objetivos, error } = await admin.from('okr_objetivos').select('*').eq('empresa_id', empresaId).eq('anio', anio).order('orden').order('id');
  if (error) throw new Error(/okr_objetivos/.test(error.message) ? 'Falta aplicar la migración 20261123_okr.sql en Supabase.' : error.message);
  const ids = (objetivos || []).map(o => o.id);
  const krs = ids.length
    ? (await admin.from('okr_resultados_clave').select('*').in('objetivo_id', ids).order('trimestre').order('orden').order('id')).data || []
    : [];
  return {
    objetivos: (objetivos || []) as ObjetivoOKR[],
    krs: (krs as ResultadoClave[]).map(k => ({
      ...k,
      valor_inicial: Number(k.valor_inicial) || 0,
      meta: k.meta === null ? null : Number(k.meta),
      resultado_actual: k.resultado_actual === null ? null : Number(k.resultado_actual),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const url = new URL(request.url);
    const hoy = new Date();
    const anio = Number(url.searchParams.get('anio')) || hoy.getFullYear();
    const trimestre = Math.min(4, Math.max(1, Number(url.searchParams.get('trimestre')) || Math.floor(hoy.getMonth() / 3) + 1));

    const { objetivos, krs } = await cargarOkr(ctx, anio);

    // KPIs de personas activas con sus resultados por mes (para el avance de los KR calculados y la alineación)
    const activosIds = ctx.activos.map(e => e.id);
    const kpis = await porLotes(activosIds, async lote => {
      const { data, error } = await ctx.admin.from('indicadores').select('id, empleado_id, titulo, kr_id, resultados:resultados_kpi(periodo, progreso, resultado, indicador_id)').in('empleado_id', lote);
      if (error) throw error;
      return (data || []) as unknown as { id: number; empleado_id: number; titulo: string; kr_id: number | null; resultados: ResultadoKpi[] }[];
    });
    const trimestreDeKr = new Map(krs.map(k => [k.id, k.trimestre]));
    const vinculados: KpiDeKr[] = kpis.filter(k => k.kr_id && trimestreDeKr.has(k.kr_id)).map(k => ({
      id: k.id, kr_id: k.kr_id!, empleado_id: k.empleado_id, titulo: k.titulo,
      progreso: progresoKpiEnTrimestre(k.resultados, anio, trimestreDeKr.get(k.kr_id!)!),
    }));
    const avance = calcularAvance(objetivos, krs, vinculados, trimestre);

    // Detalle de KPIs solo dentro del alcance de quien consulta
    const visibles = new Set(ctx.alcance.tipo === 'empresa' ? activosIds : [...ctx.alcance.equipoIds, ...(ctx.miBase ? [ctx.miBase.id] : [])]);
    const nombre = new Map(ctx.activos.map(e => [e.id, e.nombre]));
    const kpisPorKr: RespuestaOKR['kpisPorKr'] = {};
    vinculados.forEach(k => {
      const g = kpisPorKr[k.kr_id] ?? (kpisPorKr[k.kr_id] = { total: 0, conAvance: 0, visibles: [] });
      g.total++;
      if (k.progreso !== null) g.conAvance++;
      if (visibles.has(k.empleado_id)) g.visibles.push({ id: k.id, titulo: k.titulo, persona: nombre.get(k.empleado_id) || '', progreso: k.progreso });
    });

    const miId = ctx.miBase?.id ?? null;
    const esAdmin = ctx.perfil.rol === 'admin';
    const respuesta: RespuestaOKR = {
      anio, trimestre, objetivos, krs,
      avance: { kr: Object.fromEntries(avance.kr), objetivo: Object.fromEntries(avance.objetivo) },
      kpisPorKr,
      alineacion: { total: kpis.length, alineados: kpis.filter(k => k.kr_id).length },
      permisos: { empresa: esAdmin, areas: esAdmin ? ctx.areas.map(a => a.id) : ctx.areas.filter(a => a.lider_id === miId).map(a => a.id) },
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en GET /api/okr:', error);
    return errorJson(mensajeDeError(error), 500);
  }
}

interface CuerpoOKR {
  accion?: string; id?: number;
  area_id?: number | null; anio?: number; titulo?: string; descripcion?: string | null; kr_padre_id?: number | null; responsable_id?: number | null;
  objetivo_id?: number; trimestre?: number; tipo_medicion?: TipoMedicion; meta?: number | null; valor_inicial?: number;
  unidad?: string | null; direccion?: 'creciente' | 'decreciente'; resultado_actual?: number | null;
}

export async function POST(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const { admin, empresaId, areas, perfil, usuario } = ctx;
    const esAdmin = perfil.rol === 'admin';
    const miId = ctx.miBase?.id ?? null;
    const b = await request.json() as CuerpoOKR;
    const puede = (areaId: number | null) => puedeGestionarNivel(areaId, esAdmin, miId, areas);
    const texto = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

    const objetivoPorId = async (id: number) => {
      const { data } = await admin.from('okr_objetivos').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle<ObjetivoOKR>();
      return data;
    };
    const krPorId = async (id: number) => {
      const { data } = await admin.from('okr_resultados_clave').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle<ResultadoClave>();
      return data;
    };

    switch (b.accion) {
      case 'crear_objetivo':
      case 'editar_objetivo': {
        const previo = b.accion === 'editar_objetivo' ? await objetivoPorId(Number(b.id)) : null;
        if (b.accion === 'editar_objetivo' && !previo) return errorJson('El objetivo no existe.', 404);
        const areaId = previo ? previo.area_id : (b.area_id ?? null);
        const anio = previo ? previo.anio : Number(b.anio);
        if (areaId !== null && !areas.some(a => a.id === areaId)) return errorJson('El área no existe.', 400);
        if (!puede(areaId)) return errorJson(areaId === null ? 'Solo el Admin gestiona los objetivos de la empresa.' : 'Solo el líder del área (o el Admin) gestiona sus objetivos.', 403);
        if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return errorJson('Año no válido.', 400);
        const titulo = texto(b.titulo);
        if (!titulo) return errorJson('Escribe el objetivo.', 400);
        const krPadreId = areaId === null ? null : (b.kr_padre_id ?? previo?.kr_padre_id ?? null);
        const { objetivos, krs } = await cargarOkr(ctx, anio);
        const errorAlineacion = validarAlineacion(areaId, krs.find(k => k.id === krPadreId), objetivos, areas, anio);
        if (errorAlineacion) return errorJson(errorAlineacion, 400);
        const responsable = b.responsable_id && ctx.activos.some(e => e.id === b.responsable_id) ? b.responsable_id
          : (areaId !== null ? areas.find(a => a.id === areaId)?.lider_id ?? null : null);
        const fila = { titulo, descripcion: texto(b.descripcion, 2000) || null, kr_padre_id: krPadreId, responsable_id: responsable };
        const { error } = previo
          ? await admin.from('okr_objetivos').update(fila).eq('id', previo.id)
          : await admin.from('okr_objetivos').insert({ ...fila, empresa_id: empresaId, area_id: areaId, anio, creado_por: usuario.id, orden: objetivos.length });
        if (error) throw error;
        break;
      }
      case 'eliminar_objetivo': {
        const o = await objetivoPorId(Number(b.id));
        if (!o) return errorJson('El objetivo no existe.', 404);
        if (!puede(o.area_id)) return errorJson('No puedes eliminar este objetivo.', 403);
        const { error } = await admin.from('okr_objetivos').delete().eq('id', o.id);
        if (error) throw error;
        break;
      }
      case 'crear_kr':
      case 'editar_kr': {
        const previo = b.accion === 'editar_kr' ? await krPorId(Number(b.id)) : null;
        if (b.accion === 'editar_kr' && !previo) return errorJson('El resultado clave no existe.', 404);
        const o = await objetivoPorId(previo ? previo.objetivo_id : Number(b.objetivo_id));
        if (!o) return errorJson('El objetivo no existe.', 404);
        if (!puede(o.area_id)) return errorJson('No puedes gestionar los resultados clave de este objetivo.', 403);
        const d = {
          titulo: texto(b.titulo), trimestre: Number(b.trimestre), tipo_medicion: (b.tipo_medicion === 'medido' ? 'medido' : 'calculado') as TipoMedicion,
          meta: b.meta === null || b.meta === undefined || (b.meta as unknown) === '' ? null : Number(b.meta),
          valor_inicial: Number(b.valor_inicial ?? 0) || 0,
        };
        const invalido = validarKr(d);
        if (invalido) return errorJson(invalido, 400);
        const fila = { ...d, unidad: texto(b.unidad, 40) || null, direccion: b.direccion === 'decreciente' ? 'decreciente' : 'creciente' };
        const { error } = previo
          ? await admin.from('okr_resultados_clave').update(fila).eq('id', previo.id)
          : await admin.from('okr_resultados_clave').insert({ ...fila, objetivo_id: o.id, empresa_id: empresaId });
        if (error) throw error;
        break;
      }
      case 'eliminar_kr': {
        const k = await krPorId(Number(b.id));
        if (!k) return errorJson('El resultado clave no existe.', 404);
        const o = await objetivoPorId(k.objetivo_id);
        if (!o || !puede(o.area_id)) return errorJson('No puedes eliminar este resultado clave.', 403);
        const { error } = await admin.from('okr_resultados_clave').delete().eq('id', k.id);
        if (error) throw error;
        break;
      }
      case 'actualizar_kr': {
        const k = await krPorId(Number(b.id));
        if (!k) return errorJson('El resultado clave no existe.', 404);
        const o = await objetivoPorId(k.objetivo_id);
        if (!o || !puede(o.area_id)) return errorJson('No puedes actualizar este resultado clave.', 403);
        if (k.tipo_medicion !== 'medido') return errorJson('Este resultado clave se calcula con lo que tiene vinculado.', 400);
        const valor = b.resultado_actual === null || b.resultado_actual === undefined ? null : Number(b.resultado_actual);
        if (valor !== null && !Number.isFinite(valor)) return errorJson('El resultado no es un número válido.', 400);
        const { error } = await admin.from('okr_resultados_clave').update({ resultado_actual: valor, actualizado_en: new Date().toISOString() }).eq('id', k.id);
        if (error) throw error;
        break;
      }
      default:
        return errorJson('Acción no válida.', 400);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error en POST /api/okr:', error);
    return errorJson(`No se pudo guardar: ${mensajeDeError(error)}`, 500);
  }
}
