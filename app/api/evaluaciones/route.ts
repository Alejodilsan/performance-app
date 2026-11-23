import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion, porLotes, type ContextoSesion } from '@/lib/servidor/contexto'
import {
  BIBLIOTECA_BASE, PARES_RECOMENDADOS, asignacionesAutomaticas, conResultados, consolidar, cuestionarioPara, distribucion,
  enCurso, indiceFase, liderDirectoDe, sesgoEvaluadores, siguienteEstado, validarCiclo, validarRespuesta,
  type Ciclo, type Competencia, type Cuestionario, type EvaluacionRecibida, type GrupoCompetencia, type Relacion,
} from '@/lib/evaluacion360'
import type { DetalleInforme, PersonaMin, RespuestaEv360 } from '@/lib/evaluacion360Api'
import type { Empleado } from '@/lib/tipos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Evaluación 360 por ciclos. Todo pasa por aquí (tablas ev360_* sin políticas RLS).
 *  GET  ?ciclo=ID            → lo que la persona necesita del ciclo según su rol y la fase.
 *  GET  ?informe=PARTICIPANTE → informe individual consolidado (anonimato por umbral).
 *  POST { accion, ... }      → ver el switch de POST.
 * Reglas: el Admin configura y avanza fases; el líder directo elige los pares de su equipo y entrega los resultados
 * en una conversación 1:1; la persona ve su informe solo después de esa conversación. Nadie ve quién respondió qué
 * (salvo la evaluación del líder, que no es anónima).
 */
export const dynamic = 'force-dynamic';

type Ok = Extract<ContextoSesion, { estado: 'ok' }>;
type Asignacion = { id: number; ciclo_id: number; evaluado_id: number; evaluador_id: number; relacion: Relacion; estado: 'pendiente' | 'completada'; fortaleza: string | null; consejo: string | null };
type Participante = { id: number; ciclo_id: number; evaluado_id: number; lider_id: number | null; es_lider: boolean; conversado_en: string | null; conversado_por: number | null; acuerdos: string | null; reflexion: string | null };

const FALTA_MIGRACION = 'Falta aplicar la migración 20261124_evaluacion_360.sql en Supabase.';

async function contexto(request: Request): Promise<Ok | NextResponse> {
  const ctx = await obtenerContextoSesion(request);
  if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
  if (ctx.estado !== 'ok') return errorJson('Sin acceso.', 403);
  return ctx;
}

const error = (e: { message: string } | null) => {
  if (!e) return;
  throw new Error(/ev360_/.test(e.message) && /does not exist|schema cache|relation/i.test(e.message) ? FALTA_MIGRACION : e.message);
};

/** Lee todas las filas de una consulta en páginas de 1000 (límite de PostgREST). */
async function paginar<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await consulta(desde, desde + 999);
    error(e);
    filas.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

const persona = (e: Empleado | undefined, id: number): PersonaMin =>
  e ? { id: e.id, nombre: e.nombre, puesto: e.puesto, area_id: e.area_id } : { id, nombre: 'Colaborador', puesto: '', area_id: null };

const numero = (c: Record<string, unknown>) => ({
  ...c,
  peso_lider: Number(c.peso_lider), peso_pares: Number(c.peso_pares), peso_colaboradores: Number(c.peso_colaboradores), minimo_anonimato: Number(c.minimo_anonimato),
}) as unknown as Ciclo;

async function cicloPorId(admin: SupabaseClient, empresaId: number, id: number): Promise<Ciclo | null> {
  const { data, error: e } = await admin.from('ev360_ciclos').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  error(e);
  return data ? numero(data) : null;
}

async function cargarBiblioteca(admin: SupabaseClient, empresaId: number): Promise<Competencia[]> {
  const [{ data: comps, error: e1 }, { data: conds, error: e2 }] = await Promise.all([
    admin.from('ev360_competencias').select('*').eq('empresa_id', empresaId).order('orden').order('id'),
    admin.from('ev360_conductas').select('*').eq('empresa_id', empresaId).order('orden').order('id'),
  ]);
  error(e1); error(e2);
  return (comps || []).map(c => ({ ...c, conductas: (conds || []).filter(x => x.competencia_id === c.id).map(x => ({ id: x.id, texto: x.texto, orden: x.orden })) })) as Competencia[];
}

async function cargarParticipantes(admin: SupabaseClient, cicloId: number) {
  return paginar<Participante>((d, h) => admin.from('ev360_participantes').select('*').eq('ciclo_id', cicloId).order('id').range(d, h));
}
async function cargarAsignaciones(admin: SupabaseClient, cicloId: number) {
  return paginar<Asignacion>((d, h) => admin.from('ev360_asignaciones').select('id, ciclo_id, evaluado_id, evaluador_id, relacion, estado, fortaleza, consejo').eq('ciclo_id', cicloId).order('id').range(d, h));
}

/** Evaluaciones completadas (con respuestas) por persona evaluada, y las calibraciones del ciclo */
async function cargarRecibidas(admin: SupabaseClient, cicloId: number, asignaciones: Asignacion[], evaluados: Set<number>) {
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

const pesosDe = (c: Ciclo) => ({ lider: c.peso_lider, pares: c.peso_pares, colaboradores: c.peso_colaboradores });

/** ¿Puede ver el informe de este participante? */
function puedeVerInforme(ctx: Ok, ciclo: Ciclo, p: Participante) {
  if (!conResultados(ciclo.estado)) return false;
  const miId = ctx.miBase?.id ?? null;
  if (ctx.perfil.rol === 'admin' || ctx.perfil.rol === 'auditor') return true;
  if (miId !== null && p.lider_id === miId) return true;
  return miId !== null && p.evaluado_id === miId && indiceFase(ciclo.estado) >= indiceFase('resultados') && !!p.conversado_en;
}

// ------------------------------------------------------------------ GET

export async function GET(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const url = new URL(request.url);
    const informe = Number(url.searchParams.get('informe'));
    if (informe) return NextResponse.json(await detalleInforme(ctx, informe));
    return NextResponse.json(await resumen(ctx, Number(url.searchParams.get('ciclo')) || null));
  } catch (e) {
    console.error('Error en GET /api/evaluaciones:', e);
    return errorJson(mensajeDeError(e), 500);
  }
}

async function resumen(ctx: Ok, cicloPedido: number | null): Promise<RespuestaEv360> {
  const { admin, empresaId } = ctx;
  const esAdmin = ctx.perfil.rol === 'admin';
  const esAuditor = ctx.perfil.rol === 'auditor';
  const miId = ctx.miBase?.id ?? null;
  const porId = new Map(ctx.todos.map(e => [e.id, e]));
  const p = (id: number) => persona(porId.get(id), id);

  const { data: filas, error: e } = await admin.from('ev360_ciclos')
    .select('id, nombre, frecuencia, periodo_desde, periodo_hasta, nominacion_hasta, evaluacion_hasta, calibracion_hasta, estado, peso_lider, peso_pares, peso_colaboradores, minimo_anonimato, lanzado_en')
    .eq('empresa_id', empresaId).order('periodo_desde', { ascending: false }).order('id', { ascending: false });
  error(e);
  const ciclos = (filas || []).map(numero).filter(c => esAdmin || c.estado !== 'borrador');
  const elegido = ciclos.find(c => c.id === cicloPedido) ?? ciclos.find(c => enCurso(c.estado)) ?? ciclos[0] ?? null;

  const vacio: RespuestaEv360 = {
    permisos: { admin: esAdmin, auditor: esAuditor, miId }, ciclos, ciclo: null,
    biblioteca: esAdmin ? await cargarBiblioteca(admin, empresaId) : null,
    mias: [], nominacion: [], candidatos: [], avance: null, informes: [], calibracion: null,
  };
  if (!elegido) return vacio;
  const ciclo = (await cicloPorId(admin, empresaId, elegido.id))!;
  const r: RespuestaEv360 = { ...vacio, ciclo };
  if (ciclo.estado === 'borrador') return r;

  const [participantes, asignaciones] = await Promise.all([cargarParticipantes(admin, ciclo.id), cargarAsignaciones(admin, ciclo.id)]);
  const participantePorEvaluado = new Map(participantes.map(x => [x.evaluado_id, x]));

  r.mias = asignaciones.filter(a => a.evaluador_id === miId).map(a => ({
    id: a.id, evaluado: p(a.evaluado_id), relacion: a.relacion, estado: a.estado, es_lider: participantePorEvaluado.get(a.evaluado_id)?.es_lider ?? false,
  })).sort((a, b) => (a.relacion === 'auto' ? -1 : b.relacion === 'auto' ? 1 : 0) || a.evaluado.nombre.localeCompare(b.evaluado.nombre, 'es'));

  // Nominación y seguimiento del equipo: el líder directo de cada persona (el Admin, de todas)
  const gestionados = participantes.filter(x => esAdmin || (miId !== null && x.lider_id === miId));
  if (gestionados.length) {
    r.nominacion = gestionados.map(x => ({
      participante_id: x.id, evaluado: p(x.evaluado_id), es_lider: x.es_lider, lider_id: x.lider_id,
      evaluadores: asignaciones.filter(a => a.evaluado_id === x.evaluado_id && a.relacion !== 'auto')
        .map(a => ({ asignacion_id: a.id, evaluador: p(a.evaluador_id), relacion: a.relacion, estado: a.estado }))
        .sort((a, b) => a.relacion.localeCompare(b.relacion) || a.evaluador.nombre.localeCompare(b.evaluador.nombre, 'es')),
    })).sort((a, b) => a.evaluado.nombre.localeCompare(b.evaluado.nombre, 'es'));
    if (ciclo.estado === 'nominacion' || ciclo.estado === 'evaluacion') {
      r.candidatos = ctx.activos.map(e => persona(e, e.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
  }

  // Avance: Admin/Auditor toda la empresa; líder, las evaluaciones que reciben sus reportes
  const visiblesAvance = esAdmin || esAuditor ? asignaciones : asignaciones.filter(a => gestionados.some(g => g.evaluado_id === a.evaluado_id));
  if (visiblesAvance.length && (esAdmin || esAuditor || gestionados.length)) {
    const porArea = new Map<string, { area: string; total: number; completadas: number }>();
    visiblesAvance.forEach(a => {
      const nombreArea = ctx.areas.find(x => x.id === porId.get(a.evaluado_id)?.area_id)?.nombre ?? 'Sin área';
      const g = porArea.get(nombreArea) ?? { area: nombreArea, total: 0, completadas: 0 };
      g.total++; if (a.estado === 'completada') g.completadas++;
      porArea.set(nombreArea, g);
    });
    const pendientesPor = new Map<number, number>();
    visiblesAvance.filter(a => a.estado === 'pendiente').forEach(a => pendientesPor.set(a.evaluador_id, (pendientesPor.get(a.evaluador_id) ?? 0) + 1));
    r.avance = {
      total: visiblesAvance.length,
      completadas: visiblesAvance.filter(a => a.estado === 'completada').length,
      porArea: [...porArea.values()].sort((a, b) => a.area.localeCompare(b.area, 'es')),
      rezagados: [...pendientesPor.entries()].map(([id, n]) => ({ persona: p(id), pendientes: n })).sort((a, b) => b.pendientes - a.pendientes).slice(0, 15),
    };
  }

  // Informes (desde la calibración)
  if (conResultados(ciclo.estado)) {
    const visibles = participantes.filter(x => puedeVerInforme(ctx, ciclo, x));
    const { recibidas, calibraciones } = await cargarRecibidas(admin, ciclo.id, asignaciones, new Set(visibles.map(x => x.evaluado_id)));
    r.informes = visibles.map(x => {
      const lista = recibidas.get(x.evaluado_id) ?? [];
      const inf = consolidar(cuestionarioPara(ciclo.cuestionario, x.es_lider), lista, pesosDe(ciclo), ciclo.minimo_anonimato, calibraciones.get(x.evaluado_id));
      return {
        participante_id: x.id, evaluado: p(x.evaluado_id), lider_id: x.lider_id, es_lider: x.es_lider, global: inf.global,
        respuestas: lista.filter(l => l.relacion !== 'auto').length, conversado_en: x.conversado_en, calibrado: !!calibraciones.get(x.evaluado_id),
      };
    }).sort((a, b) => a.evaluado.nombre.localeCompare(b.evaluado.nombre, 'es'));
    if (esAdmin || esAuditor) {
      const sesgo = sesgoEvaluadores([...recibidas.values()].flat());
      r.calibracion = {
        distribucion: distribucion(r.informes.map(i => i.global)),
        sesgo: { general: sesgo.general, evaluadores: sesgo.evaluadores.map(s => ({ evaluador: p(s.evaluador_id), n: s.n, promedio: s.promedio, diferencia: s.diferencia, alerta: s.alerta })) },
      };
    }
  }
  return r;
}

async function detalleInforme(ctx: Ok, participanteId: number): Promise<DetalleInforme> {
  const { admin, empresaId } = ctx;
  const miId = ctx.miBase?.id ?? null;
  const { data: part, error: e } = await admin.from('ev360_participantes').select('*').eq('id', participanteId).eq('empresa_id', empresaId).maybeSingle<Participante>();
  error(e);
  if (!part) throw new Error('El informe no existe.');
  const ciclo = await cicloPorId(admin, empresaId, part.ciclo_id);
  if (!ciclo || !puedeVerInforme(ctx, ciclo, part)) throw new Error('No tienes acceso a este informe.');

  const porId = new Map(ctx.todos.map(x => [x.id, x]));
  const asignaciones = await paginar<Asignacion>((d, h) => admin.from('ev360_asignaciones').select('id, ciclo_id, evaluado_id, evaluador_id, relacion, estado, fortaleza, consejo')
    .eq('ciclo_id', ciclo.id).eq('evaluado_id', part.evaluado_id).range(d, h));
  const { recibidas, calibraciones } = await cargarRecibidas(admin, ciclo.id, asignaciones, new Set([part.evaluado_id]));
  const esPropio = part.evaluado_id === miId;
  const informe = consolidar(cuestionarioPara(ciclo.cuestionario, part.es_lider), recibidas.get(part.evaluado_id) ?? [], pesosDe(ciclo), ciclo.minimo_anonimato, calibraciones.get(part.evaluado_id));
  // A la persona se le indica que hubo ajuste, sin la justificación interna de la calibración
  if (esPropio && ctx.perfil.rol !== 'admin') informe.competencias.forEach(c => { if (c.calibracion) c.calibracion = { ...c.calibracion, justificacion: '' }; });

  // Ciclo anterior con resultados en el que participó (tendencia)
  let anterior: DetalleInforme['anterior'] = null;
  const { data: previos } = await admin.from('ev360_ciclos').select('*').eq('empresa_id', empresaId).in('estado', ['resultados', 'cerrado'])
    .lt('periodo_desde', ciclo.periodo_desde).order('periodo_desde', { ascending: false }).limit(3);
  for (const fila of previos || []) {
    const previo = numero(fila);
    const { data: pp } = await admin.from('ev360_participantes').select('*').eq('ciclo_id', previo.id).eq('evaluado_id', part.evaluado_id).maybeSingle<Participante>();
    if (!pp) continue;
    const asig = await paginar<Asignacion>((d, h) => admin.from('ev360_asignaciones').select('id, ciclo_id, evaluado_id, evaluador_id, relacion, estado, fortaleza, consejo')
      .eq('ciclo_id', previo.id).eq('evaluado_id', part.evaluado_id).range(d, h));
    const prev = await cargarRecibidas(admin, previo.id, asig, new Set([part.evaluado_id]));
    anterior = { ciclo: previo.nombre, global: consolidar(cuestionarioPara(previo.cuestionario, pp.es_lider), prev.recibidas.get(part.evaluado_id) ?? [], pesosDe(previo), previo.minimo_anonimato, prev.calibraciones.get(part.evaluado_id)).global };
    break;
  }

  const esAdmin = ctx.perfil.rol === 'admin';
  return {
    participante_id: part.id,
    ciclo: { id: ciclo.id, nombre: ciclo.nombre, estado: ciclo.estado },
    evaluado: persona(porId.get(part.evaluado_id), part.evaluado_id),
    lider: part.lider_id ? persona(porId.get(part.lider_id), part.lider_id) : null,
    es_lider: part.es_lider,
    informe, anterior,
    conversado_en: part.conversado_en,
    conversado_por: part.conversado_por ? porId.get(part.conversado_por)?.nombre ?? null : null,
    acuerdos: part.acuerdos, reflexion: part.reflexion, esPropio,
    permisos: {
      calibrar: esAdmin && ciclo.estado === 'calibracion',
      conversar: (esAdmin || (miId !== null && part.lider_id === miId)) && ciclo.estado === 'resultados' && !esPropio,
      reflexionar: esPropio && !!part.conversado_en && ciclo.estado !== 'cerrado',
    },
  };
}

// ------------------------------------------------------------------ POST

interface Cuerpo {
  accion?: string; id?: number;
  nombre?: string; descripcion?: string | null; grupo?: GrupoCompetencia; activa?: boolean; conductas?: string[];
  frecuencia?: 'semestral' | 'anual'; periodo_desde?: string; periodo_hasta?: string;
  nominacion_hasta?: string | null; evaluacion_hasta?: string | null; calibracion_hasta?: string | null;
  peso_lider?: number; peso_pares?: number; peso_colaboradores?: number; minimo_anonimato?: number;
  participante_id?: number; evaluador_id?: number; asignacion_id?: number;
  respuestas?: Record<string, number | null>; fortaleza?: string; consejo?: string;
  competencia_id?: number; puntaje?: number | null; justificacion?: string; acuerdos?: string; reflexion?: string;
}

const MAX_PARES = 6;
const fechaValida = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function POST(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const { admin, empresaId } = ctx;
    const esAdmin = ctx.perfil.rol === 'admin';
    const miId = ctx.miBase?.id ?? null;
    const b = await request.json() as Cuerpo;
    const texto = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max);
    const soloAdmin = () => errorJson('Solo el Admin puede realizar esta acción.', 403);
    const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

    const participantePorId = async (id: number) => {
      const { data, error: e } = await admin.from('ev360_participantes').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle<Participante>();
      error(e);
      return data;
    };

    switch (b.accion) {
      // ---------------- Biblioteca de competencias (Admin)
      case 'cargar_biblioteca_base': {
        if (!esAdmin) return soloAdmin();
        const actual = await cargarBiblioteca(admin, empresaId);
        if (actual.length) return errorJson('La empresa ya tiene competencias; edítalas directamente.', 400);
        for (const [i, c] of BIBLIOTECA_BASE.entries()) {
          const { data, error: e } = await admin.from('ev360_competencias').insert({ empresa_id: empresaId, nombre: c.nombre, descripcion: c.descripcion, grupo: c.grupo, orden: i }).select('id').single();
          error(e);
          const { error: e2 } = await admin.from('ev360_conductas').insert(c.conductas.map((t, j) => ({ competencia_id: data!.id, empresa_id: empresaId, texto: t, orden: j })));
          error(e2);
        }
        return ok();
      }
      case 'guardar_competencia': {
        if (!esAdmin) return soloAdmin();
        const nombre = texto(b.nombre, 120);
        const conductas = (b.conductas || []).map(t => texto(t, 300)).filter(Boolean);
        if (!nombre) return errorJson('Escribe el nombre de la competencia.', 400);
        if (conductas.length < 1 || conductas.length > 6) return errorJson('Cada competencia necesita entre 1 y 6 conductas observables.', 400);
        const grupo: GrupoCompetencia = b.grupo === 'liderazgo' ? 'liderazgo' : 'corporativa';
        const fila = { nombre, descripcion: texto(b.descripcion, 500) || null, grupo, activa: b.activa !== false };
        let id = b.id ? Number(b.id) : null;
        if (id) {
          const { data, error: e } = await admin.from('ev360_competencias').update(fila).eq('id', id).eq('empresa_id', empresaId).select('id').maybeSingle();
          error(e);
          if (!data) return errorJson('La competencia no existe.', 404);
          const { error: e2 } = await admin.from('ev360_conductas').delete().eq('competencia_id', id);
          error(e2);
        } else {
          const { count } = await admin.from('ev360_competencias').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
          const { data, error: e } = await admin.from('ev360_competencias').insert({ ...fila, empresa_id: empresaId, orden: count ?? 0 }).select('id').single();
          error(e);
          id = data!.id as number;
        }
        // Los ciclos lanzados tienen su cuestionario congelado: reemplazar las conductas no los afecta
        const { error: e3 } = await admin.from('ev360_conductas').insert(conductas.map((t, j) => ({ competencia_id: id, empresa_id: empresaId, texto: t, orden: j })));
        error(e3);
        return ok({ id });
      }
      case 'eliminar_competencia': {
        if (!esAdmin) return soloAdmin();
        const { error: e } = await admin.from('ev360_competencias').delete().eq('id', Number(b.id)).eq('empresa_id', empresaId);
        error(e);
        return ok();
      }

      // ---------------- Ciclos (Admin)
      case 'crear_ciclo':
      case 'editar_ciclo': {
        if (!esAdmin) return soloAdmin();
        const previo = b.accion === 'editar_ciclo' ? await cicloPorId(admin, empresaId, Number(b.id)) : null;
        if (b.accion === 'editar_ciclo' && !previo) return errorJson('El ciclo no existe.', 404);
        if (previo && (previo.estado === 'resultados' || previo.estado === 'cerrado')) return errorJson('Los resultados ya se entregaron: el ciclo no se puede editar.', 400);
        const datos = {
          nombre: texto(b.nombre, 120),
          frecuencia: b.frecuencia === 'anual' ? 'anual' : 'semestral',
          periodo_desde: fechaValida(b.periodo_desde) ?? '', periodo_hasta: fechaValida(b.periodo_hasta) ?? '',
          nominacion_hasta: fechaValida(b.nominacion_hasta), evaluacion_hasta: fechaValida(b.evaluacion_hasta), calibracion_hasta: fechaValida(b.calibracion_hasta),
          peso_lider: Number(b.peso_lider), peso_pares: Number(b.peso_pares), peso_colaboradores: Number(b.peso_colaboradores), minimo_anonimato: Number(b.minimo_anonimato),
        };
        const invalido = validarCiclo(datos);
        if (invalido) return errorJson(invalido, 400);
        if (previo && previo.estado !== 'borrador') {
          // Ya lanzado: el período y la frecuencia quedan fijos
          datos.frecuencia = previo.frecuencia; datos.periodo_desde = previo.periodo_desde; datos.periodo_hasta = previo.periodo_hasta;
        }
        const { data, error: e } = previo
          ? await admin.from('ev360_ciclos').update(datos).eq('id', previo.id).select('id').single()
          : await admin.from('ev360_ciclos').insert({ ...datos, empresa_id: empresaId, creado_por: ctx.usuario.id }).select('id').single();
        error(e);
        return ok({ id: data!.id });
      }
      case 'eliminar_ciclo': {
        if (!esAdmin) return soloAdmin();
        const ciclo = await cicloPorId(admin, empresaId, Number(b.id));
        if (!ciclo) return errorJson('El ciclo no existe.', 404);
        if (ciclo.estado !== 'borrador') return errorJson('Solo se puede eliminar un ciclo que aún no se ha lanzado.', 400);
        const { error: e } = await admin.from('ev360_ciclos').delete().eq('id', ciclo.id);
        error(e);
        return ok();
      }
      case 'avanzar_fase': {
        if (!esAdmin) return soloAdmin();
        const ciclo = await cicloPorId(admin, empresaId, Number(b.id));
        if (!ciclo) return errorJson('El ciclo no existe.', 404);
        const siguiente = siguienteEstado(ciclo.estado);
        if (!siguiente) return errorJson('El ciclo ya está cerrado.', 400);
        if (ciclo.estado === 'borrador') {
          const { data: otros } = await admin.from('ev360_ciclos').select('id, nombre').eq('empresa_id', empresaId).not('estado', 'in', '(borrador,cerrado)');
          if (otros?.length) return errorJson(`Ya hay un ciclo en curso (${otros[0].nombre}). Ciérralo antes de lanzar otro.`, 400);
          await lanzar(ctx, ciclo);
          return ok();
        }
        const { error: e } = await admin.from('ev360_ciclos').update({ estado: siguiente }).eq('id', ciclo.id).eq('estado', ciclo.estado);
        error(e);
        return ok();
      }
      case 'reabrir_evaluacion': {
        if (!esAdmin) return soloAdmin();
        const ciclo = await cicloPorId(admin, empresaId, Number(b.id));
        if (!ciclo || ciclo.estado !== 'calibracion') return errorJson('Solo se puede reabrir la evaluación de un ciclo en calibración.', 400);
        const { error: e } = await admin.from('ev360_ciclos').update({ estado: 'evaluacion' }).eq('id', ciclo.id);
        error(e);
        return ok();
      }

      // ---------------- Nominación: el líder directo (o el Admin) elige los pares
      case 'excluir_participante': {
        if (!esAdmin) return soloAdmin();
        const part = await participantePorId(Number(b.participante_id));
        if (!part) return errorJson('La persona no participa en el ciclo.', 404);
        const ciclo = await cicloPorId(admin, empresaId, part.ciclo_id);
        if (ciclo?.estado !== 'nominacion') return errorJson('Solo se puede excluir a alguien durante la nominación.', 400);
        const { error: e1 } = await admin.from('ev360_asignaciones').delete().eq('ciclo_id', part.ciclo_id).eq('evaluado_id', part.evaluado_id);
        error(e1);
        const { error: e2 } = await admin.from('ev360_participantes').delete().eq('id', part.id);
        error(e2);
        return ok();
      }
      case 'agregar_par': {
        const part = await participantePorId(Number(b.participante_id));
        if (!part) return errorJson('La persona no participa en el ciclo.', 404);
        if (!esAdmin && (miId === null || part.lider_id !== miId)) return errorJson('Solo su líder directo (o el Admin) elige los pares.', 403);
        const ciclo = await cicloPorId(admin, empresaId, part.ciclo_id);
        if (ciclo?.estado !== 'nominacion' && ciclo?.estado !== 'evaluacion') return errorJson('Los pares se eligen durante la nominación o la evaluación.', 400);
        const evaluadorId = Number(b.evaluador_id);
        if (!ctx.activos.some(e => e.id === evaluadorId)) return errorJson('El evaluador no es un colaborador activo.', 400);
        if (evaluadorId === part.evaluado_id) return errorJson('La autoevaluación ya está incluida.', 400);
        const { data: actuales, error: e } = await admin.from('ev360_asignaciones').select('evaluador_id, relacion').eq('ciclo_id', part.ciclo_id).eq('evaluado_id', part.evaluado_id);
        error(e);
        const ya = (actuales || []).find(a => a.evaluador_id === evaluadorId);
        if (ya) return errorJson(`Esa persona ya evalúa como ${ya.relacion === 'lider' ? 'líder' : ya.relacion}.`, 400);
        if ((actuales || []).filter(a => a.relacion === 'par').length >= MAX_PARES) return errorJson(`Máximo ${MAX_PARES} pares por persona (se recomiendan ${PARES_RECOMENDADOS.min}–${PARES_RECOMENDADOS.max}).`, 400);
        const { error: e2 } = await admin.from('ev360_asignaciones').insert({
          ciclo_id: part.ciclo_id, empresa_id: empresaId, evaluado_id: part.evaluado_id, evaluador_id: evaluadorId, relacion: 'par', asignada_por: miId,
        });
        error(e2);
        return ok();
      }
      case 'quitar_par': {
        const { data: asig, error: e } = await admin.from('ev360_asignaciones').select('*').eq('id', Number(b.asignacion_id)).eq('empresa_id', empresaId).maybeSingle<Asignacion>();
        error(e);
        if (!asig || asig.relacion !== 'par') return errorJson('Solo se pueden quitar pares.', 400);
        if (asig.estado === 'completada') return errorJson('Ese par ya respondió: su evaluación no se puede quitar.', 400);
        const { data: part } = await admin.from('ev360_participantes').select('*').eq('ciclo_id', asig.ciclo_id).eq('evaluado_id', asig.evaluado_id).maybeSingle<Participante>();
        if (!esAdmin && (miId === null || part?.lider_id !== miId)) return errorJson('Solo su líder directo (o el Admin) gestiona los pares.', 403);
        const ciclo = await cicloPorId(admin, empresaId, asig.ciclo_id);
        if (ciclo?.estado !== 'nominacion' && ciclo?.estado !== 'evaluacion') return errorJson('La nominación ya terminó.', 400);
        const { error: e2 } = await admin.from('ev360_asignaciones').delete().eq('id', asig.id).eq('estado', 'pendiente');
        error(e2);
        return ok();
      }

      // ---------------- Responder una evaluación
      case 'responder': {
        const { data: asig, error: e } = await admin.from('ev360_asignaciones').select('*').eq('id', Number(b.asignacion_id)).eq('empresa_id', empresaId).maybeSingle<Asignacion>();
        error(e);
        if (!asig || miId === null || asig.evaluador_id !== miId) return errorJson('Esta evaluación no está asignada a ti.', 403);
        if (asig.estado === 'completada') return errorJson('Ya enviaste esta evaluación.', 400);
        const ciclo = await cicloPorId(admin, empresaId, asig.ciclo_id);
        if (ciclo?.estado !== 'evaluacion') return errorJson('La ventana de evaluación no está abierta.', 400);
        const { data: part } = await admin.from('ev360_participantes').select('es_lider').eq('ciclo_id', asig.ciclo_id).eq('evaluado_id', asig.evaluado_id).maybeSingle();
        const items = cuestionarioPara(ciclo.cuestionario, !!part?.es_lider);
        const respuestas: Record<number, number | null> = {};
        Object.entries(b.respuestas || {}).forEach(([k, v]) => { respuestas[Number(k)] = v === null ? null : Number(v); });
        const fortaleza = texto(b.fortaleza), consejo = texto(b.consejo);
        const invalido = validarRespuesta(items, respuestas, fortaleza, consejo);
        if (invalido) return errorJson(invalido, 400);
        const filas = items.flatMap(c => c.conductas.map(x => ({ asignacion_id: asig.id, competencia_id: c.id, conducta_id: x.id, puntaje: respuestas[x.id] })));
        const { error: e1 } = await admin.from('ev360_respuestas').delete().eq('asignacion_id', asig.id);
        error(e1);
        const { error: e2 } = await admin.from('ev360_respuestas').insert(filas);
        error(e2);
        const { data: hecho, error: e3 } = await admin.from('ev360_asignaciones')
          .update({ estado: 'completada', fortaleza, consejo, completada_en: new Date().toISOString() })
          .eq('id', asig.id).eq('estado', 'pendiente').select('id');
        error(e3);
        if (!hecho?.length) return errorJson('Ya enviaste esta evaluación.', 400);
        return ok();
      }

      // ---------------- Calibración (Admin)
      case 'calibrar': {
        if (!esAdmin) return soloAdmin();
        const part = await participantePorId(Number(b.participante_id));
        if (!part) return errorJson('La persona no participa en el ciclo.', 404);
        const ciclo = await cicloPorId(admin, empresaId, part.ciclo_id);
        if (ciclo?.estado !== 'calibracion') return errorJson('Solo se calibra durante la fase de calibración.', 400);
        const competenciaId = Number(b.competencia_id);
        if (!cuestionarioPara(ciclo.cuestionario, part.es_lider).some(c => c.id === competenciaId)) return errorJson('La competencia no aplica a esta persona.', 400);
        if (b.puntaje === null || b.puntaje === undefined) {
          const { error: e } = await admin.from('ev360_calibraciones').delete().eq('ciclo_id', ciclo.id).eq('evaluado_id', part.evaluado_id).eq('competencia_id', competenciaId);
          error(e);
          return ok();
        }
        const puntaje = Math.round(Number(b.puntaje) * 10) / 10;
        if (!(puntaje >= 1 && puntaje <= 5)) return errorJson('El puntaje calibrado debe estar entre 1 y 5.', 400);
        const justificacion = texto(b.justificacion, 1000);
        if (justificacion.length < 10) return errorJson('Explica el motivo del ajuste (queda registrado).', 400);
        const { error: e } = await admin.from('ev360_calibraciones').upsert({
          ciclo_id: ciclo.id, empresa_id: empresaId, evaluado_id: part.evaluado_id, competencia_id: competenciaId, puntaje, justificacion, ajustado_por: miId, created_at: new Date().toISOString(),
        }, { onConflict: 'ciclo_id,evaluado_id,competencia_id' });
        error(e);
        return ok();
      }

      // ---------------- Entrega de resultados
      case 'registrar_conversacion': {
        const part = await participantePorId(Number(b.participante_id));
        if (!part) return errorJson('La persona no participa en el ciclo.', 404);
        if (!esAdmin && (miId === null || part.lider_id !== miId)) return errorJson('Solo su líder directo (o el Admin) registra la conversación.', 403);
        if (part.evaluado_id === miId) return errorJson('No puedes registrar tu propia conversación de resultados.', 400);
        const ciclo = await cicloPorId(admin, empresaId, part.ciclo_id);
        if (ciclo?.estado !== 'resultados') return errorJson('La entrega de resultados no está abierta.', 400);
        const acuerdos = texto(b.acuerdos);
        if (acuerdos.length < 20) return errorJson('Registra los acuerdos de la conversación (al menos una frase).', 400);
        const { error: e } = await admin.from('ev360_participantes').update({
          acuerdos, conversado_en: part.conversado_en ?? new Date().toISOString(), conversado_por: part.conversado_por ?? miId,
        }).eq('id', part.id);
        error(e);
        return ok();
      }
      case 'guardar_reflexion': {
        const part = await participantePorId(Number(b.participante_id));
        if (!part || miId === null || part.evaluado_id !== miId) return errorJson('Solo la persona evaluada deja su reflexión.', 403);
        if (!part.conversado_en) return errorJson('Tu informe se habilita después de la conversación con tu líder.', 400);
        const { error: e } = await admin.from('ev360_participantes').update({ reflexion: texto(b.reflexion) || null, reflexion_en: new Date().toISOString() }).eq('id', part.id);
        error(e);
        return ok();
      }
    }
    return errorJson('Acción no reconocida.', 400);
  } catch (e) {
    console.error('Error en POST /api/evaluaciones:', e);
    return errorJson(mensajeDeError(e), 500);
  }
}

/** Lanza el ciclo: congela el cuestionario, crea a los participantes (activos) y las asignaciones automáticas. */
async function lanzar(ctx: Ok, ciclo: Ciclo) {
  const { admin, empresaId, areas, activos } = ctx;
  const biblioteca = (await cargarBiblioteca(admin, empresaId)).filter(c => c.activa && c.conductas.length > 0);
  if (!biblioteca.some(c => c.grupo === 'corporativa')) throw new Error('Antes de lanzar, define al menos una competencia corporativa activa con conductas.');
  const cuestionario: Cuestionario = {
    competencias: biblioteca.map(c => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion, grupo: c.grupo, conductas: c.conductas.map(x => ({ id: x.id, texto: x.texto })) })),
  };
  if (activos.length === 0) throw new Error('No hay colaboradores activos para evaluar.');

  const lideres = new Map(activos.map(e => [e.id, liderDirectoDe(e, areas, activos)]));
  const tienenEquipo = new Set([...lideres.values()].filter((x): x is number => x !== null));
  const participantes = activos.map(e => ({ ciclo_id: ciclo.id, empresa_id: empresaId, evaluado_id: e.id, lider_id: lideres.get(e.id) ?? null, es_lider: tienenEquipo.has(e.id) }));

  // Primero se congela el cuestionario y se marca el lanzamiento (si algo falla luego, se revierte)
  const { data: marcado, error: e0 } = await admin.from('ev360_ciclos').update({ estado: 'nominacion', cuestionario, lanzado_en: new Date().toISOString() })
    .eq('id', ciclo.id).eq('estado', 'borrador').select('id');
  error(e0);
  if (!marcado?.length) throw new Error('El ciclo ya fue lanzado.');
  try {
    for (let i = 0; i < participantes.length; i += 500) {
      const { error: e } = await admin.from('ev360_participantes').insert(participantes.slice(i, i + 500));
      error(e);
    }
    const asignaciones = asignacionesAutomaticas(participantes).map(a => ({ ...a, ciclo_id: ciclo.id, empresa_id: empresaId }));
    for (let i = 0; i < asignaciones.length; i += 500) {
      const { error: e } = await admin.from('ev360_asignaciones').insert(asignaciones.slice(i, i + 500));
      error(e);
    }
  } catch (e) {
    await admin.from('ev360_asignaciones').delete().eq('ciclo_id', ciclo.id);
    await admin.from('ev360_participantes').delete().eq('ciclo_id', ciclo.id);
    await admin.from('ev360_ciclos').update({ estado: 'borrador', cuestionario: null, lanzado_en: null }).eq('id', ciclo.id);
    throw e;
  }
}
