// ⚠️ Solo servidor. Acceso compartido a las tablas de la evaluación 360 (ev360_*), usado por /api/evaluaciones y /api/desarrollo.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorJson } from './supabaseAdmin'
import { obtenerContextoSesion, porLotes, type ContextoSesion } from './contexto'
import { BIBLIOTECA_BASE, conResultados, indiceFase, type Ciclo, type Competencia, type EvaluacionRecibida, type Relacion } from '@/lib/evaluacion360'
import type { PersonaMin } from '@/lib/evaluacion360Api'
import type { Empleado } from '@/lib/tipos'

export type Ok = Extract<ContextoSesion, { estado: 'ok' }>;
export type Asignacion = { id: number; ciclo_id: number; evaluado_id: number; evaluador_id: number; relacion: Relacion; estado: 'pendiente' | 'completada'; fortaleza: string | null; consejo: string | null };
export type Participante = { id: number; ciclo_id: number; evaluado_id: number; lider_id: number | null; es_lider: boolean; conversado_en: string | null; conversado_por: number | null; acuerdos: string | null; reflexion: string | null };

const FALTA_MIGRACION = (m: string) => /pdi_|pulso/.test(m)
  ? 'Falta aplicar la migración 20261125_desarrollo_360.sql en Supabase.'
  : 'Falta aplicar la migración 20261124_evaluacion_360.sql en Supabase.';

export async function contexto(request: Request): Promise<Ok | NextResponse> {
  const ctx = await obtenerContextoSesion(request);
  if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
  if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
  return ctx;
}

export const error = (e: { message: string } | null) => {
  if (!e) return;
  throw new Error(/ev360_|pdi_/.test(e.message) && /does not exist|schema cache|relation/i.test(e.message) ? FALTA_MIGRACION(e.message) : e.message);
};

/** Lee todas las filas de una consulta en páginas de 1000 (límite de PostgREST). */
export async function paginar<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await consulta(desde, desde + 999);
    error(e);
    filas.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

export const persona = (e: Empleado | undefined, id: number): PersonaMin =>
  e ? { id: e.id, nombre: e.nombre, puesto: e.puesto, area_id: e.area_id } : { id, nombre: 'Colaborador', puesto: '', area_id: null };

export const numero = (c: Record<string, unknown>) => ({
  ...c,
  peso_lider: Number(c.peso_lider), peso_pares: Number(c.peso_pares), peso_colaboradores: Number(c.peso_colaboradores), minimo_anonimato: Number(c.minimo_anonimato),
}) as unknown as Ciclo;

export async function cicloPorId(admin: SupabaseClient, empresaId: number, id: number): Promise<Ciclo | null> {
  const { data, error: e } = await admin.from('ev360_ciclos').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  error(e);
  return data ? numero(data) : null;
}

export async function cargarBiblioteca(admin: SupabaseClient, empresaId: number): Promise<Competencia[]> {
  const [{ data: comps, error: e1 }, { data: conds, error: e2 }] = await Promise.all([
    admin.from('ev360_competencias').select('*').eq('empresa_id', empresaId).order('orden').order('id'),
    admin.from('ev360_conductas').select('*').eq('empresa_id', empresaId).order('orden').order('id'),
  ]);
  error(e1); error(e2);
  return (comps || []).map(c => ({ ...c, conductas: (conds || []).filter(x => x.competencia_id === c.id).map(x => ({ id: x.id, texto: x.texto, orden: x.orden })) })) as Competencia[];
}

export async function cargarParticipantes(admin: SupabaseClient, cicloId: number) {
  return paginar<Participante>((d, h) => admin.from('ev360_participantes').select('*').eq('ciclo_id', cicloId).order('id').range(d, h));
}
export async function cargarAsignaciones(admin: SupabaseClient, cicloId: number) {
  return paginar<Asignacion>((d, h) => admin.from('ev360_asignaciones').select('id, ciclo_id, evaluado_id, evaluador_id, relacion, estado, fortaleza, consejo').eq('ciclo_id', cicloId).order('id').range(d, h));
}

/** Evaluaciones completadas (con respuestas) por persona evaluada, y las calibraciones del ciclo */
export async function cargarRecibidas(admin: SupabaseClient, cicloId: number, asignaciones: Asignacion[], evaluados: Set<number>) {
  const completas = asignaciones.filter(a => a.estado === 'completada' && evaluados.has(a.evaluado_id));
  const respuestas = await porLotes(completas.map(a => a.id), lote =>
    paginar<{ asignacion_id: number; conducta_id: number; puntaje: number | null }>((d, h) =>
      admin.from('ev360_respuestas').select('asignacion_id, conducta_id, puntaje').in('asignacion_id', lote).order('asignacion_id').order('conducta_id').range(d, h)));
  const porAsignacion = new Map<number, Record<number, number | null>>();
  respuestas.forEach(r => {
    const m = porAsignacion.get(r.asignacion_id) ?? {};
    m[r.conducta_id] = r.puntaje === null ? null : Number(r.puntaje);
    porAsignacion.set(r.asignacion_id, m);
  });
  const recibidas = new Map<number, (EvaluacionRecibida & { evaluador_id: number })[]>();
  completas.forEach(a => {
    const lista = recibidas.get(a.evaluado_id) ?? [];
    lista.push({ relacion: a.relacion, respuestas: porAsignacion.get(a.id) ?? {}, fortaleza: a.fortaleza, consejo: a.consejo, evaluador_id: a.evaluador_id });
    recibidas.set(a.evaluado_id, lista);
  });
  const { data: cal, error: e } = await admin.from('ev360_calibraciones').select('evaluado_id, competencia_id, puntaje, justificacion').eq('ciclo_id', cicloId);
  error(e);
  const calibraciones = new Map<number, Record<number, { puntaje: number; justificacion: string }>>();
  (cal || []).forEach(c => {
    const m = calibraciones.get(c.evaluado_id) ?? {};
    m[c.competencia_id] = { puntaje: Number(c.puntaje), justificacion: c.justificacion };
    calibraciones.set(c.evaluado_id, m);
  });
  return { recibidas, calibraciones };
}

export const pesosDe = (c: Ciclo) => ({ lider: c.peso_lider, pares: c.peso_pares, colaboradores: c.peso_colaboradores });

/** ¿Puede ver el informe de este participante? */
export function puedeVerInforme(ctx: Ok, ciclo: Ciclo, p: Participante) {
  if (!conResultados(ciclo.estado)) return false;
  const miId = ctx.miBase?.id ?? null;
  if (ctx.perfil.rol === 'admin' || ctx.perfil.rol === 'auditor') return true;
  if (miId !== null && p.lider_id === miId) return true;
  return miId !== null && p.evaluado_id === miId && indiceFase(ciclo.estado) >= indiceFase('resultados') && !!p.conversado_en;
}


/** Carga la biblioteca base de competencias 360 en una empresa (que aún no tiene ninguna). */
export async function sembrarBiblioteca360(admin: SupabaseClient, empresaId: number) {
  for (const [i, c] of BIBLIOTECA_BASE.entries()) {
    const { data, error: e } = await admin.from('ev360_competencias').insert({ empresa_id: empresaId, nombre: c.nombre, descripcion: c.descripcion, grupo: c.grupo, orden: i }).select('id').single();
    error(e);
    const { error: e2 } = await admin.from('ev360_conductas').insert(c.conductas.map((t, j) => ({ competencia_id: data!.id, empresa_id: empresaId, texto: t, orden: j })));
    error(e2);
  }
}
