import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { porLotes } from '@/lib/servidor/contexto'
import {
  contexto, error, paginar, persona, numero, cargarRecibidas, pesosDe, puedeVerInforme, type Ok, type Asignacion, type Participante,
} from '@/lib/servidor/evaluacion360'
import { conResultados, consolidar, cuestionarioPara } from '@/lib/evaluacion360'
import {
  MAX_OBJETIVOS_ACTIVOS, TIPOS_ACCION, avanceObjetivo, estadoCheckin, validarObjetivo,
  type AccionPDI, type CheckinPDI, type EstadoObjetivo, type ObjetivoPDI, type TipoAccion,
} from '@/lib/desarrollo'
import { liderDirectoDe } from '@/lib/evaluacion360'
import { claveMes } from '@/lib/periodos'
import type { PlanPersona, ResumenDesarrollo } from '@/lib/desarrolloApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * Plan de desarrollo individual (PDI 70-20-10) y check-ins mensuales.
 *  GET                 → personas cuyo plan puedo ver (yo, mi equipo en cascada; Admin/Auditor: todos) con su estado.
 *  GET ?empleado=ID    → plan completo de la persona, check-ins y competencias sugeridas desde su último informe 360.
 *  POST { accion, ... } → guardar/eliminar objetivos y acciones, marcar acciones, registrar el check-in del mes.
 * Pueden editar: la persona, su líder directo y el Admin. El equipo en cascada y el Auditor solo leen.
 */
export const dynamic = 'force-dynamic';

const ESTADOS: EstadoObjetivo[] = ['en_curso', 'logrado', 'no_logrado', 'cancelado'];
const TIPOS = Object.keys(TIPOS_ACCION) as TipoAccion[];

function permisos(ctx: Ok, empleadoId: number) {
  const miId = ctx.miBase?.id ?? null;
  const rol = ctx.perfil.rol;
  const propio = miId === empleadoId;
  const emp = ctx.activos.find(e => e.id === empleadoId);
  const esLiderDirecto = miId !== null && (ctx.alcance.directosIds.includes(empleadoId) || (!!emp && liderDirectoDe(emp, ctx.areas, ctx.activos) === miId));
  const ver = propio || rol === 'admin' || rol === 'auditor' || ctx.alcance.equipoIds.includes(empleadoId);
  const editar = !!emp && (propio || rol === 'admin' || esLiderDirecto);
  return { ver, editar, propio };
}

async function cargarObjetivos(ctx: Ok, empleadoIds: number[]): Promise<ObjetivoPDI[]> {
  const objetivos = await porLotes(empleadoIds, lote => paginar<Omit<ObjetivoPDI, 'acciones'>>((d, h) =>
    ctx.admin.from('pdi_objetivos').select('*').eq('empresa_id', ctx.empresaId).in('empleado_id', lote).order('created_at', { ascending: false }).range(d, h)));
  const acciones = await porLotes(objetivos.map(o => o.id), lote => paginar<AccionPDI>((d, h) =>
    ctx.admin.from('pdi_acciones').select('*').in('objetivo_id', lote).order('orden').order('id').range(d, h)));
  return objetivos.map(o => ({ ...o, acciones: acciones.filter(a => a.objetivo_id === o.id) }));
}

async function cargarCheckins(ctx: Ok, empleadoIds: number[]): Promise<CheckinPDI[]> {
  return porLotes(empleadoIds, lote => paginar<CheckinPDI>((d, h) =>
    ctx.admin.from('pdi_checkins').select('*').eq('empresa_id', ctx.empresaId).in('empleado_id', lote).order('periodo', { ascending: false }).range(d, h)));
}

/** Competencias sugeridas para el PDI desde el último ciclo con resultados que quien consulta puede ver */
async function sugerencias(ctx: Ok, empleadoId: number): Promise<PlanPersona['sugerencias']> {
  const { data: filas } = await ctx.admin.from('ev360_ciclos').select('*').eq('empresa_id', ctx.empresaId)
    .in('estado', ['calibracion', 'resultados', 'cerrado']).order('periodo_desde', { ascending: false }).limit(3);
  for (const fila of filas || []) {
    const ciclo = numero(fila);
    if (!conResultados(ciclo.estado)) continue;
    const { data: part } = await ctx.admin.from('ev360_participantes').select('*').eq('ciclo_id', ciclo.id).eq('evaluado_id', empleadoId).maybeSingle<Participante>();
    if (!part) continue;
    if (!puedeVerInforme(ctx, ciclo, part)) return null;
    const asig = await paginar<Asignacion>((d, h) => ctx.admin.from('ev360_asignaciones').select('id, ciclo_id, evaluado_id, evaluador_id, relacion, estado, fortaleza, consejo')
      .eq('ciclo_id', ciclo.id).eq('evaluado_id', empleadoId).range(d, h));
    const { recibidas, calibraciones } = await cargarRecibidas(ctx.admin, ciclo.id, asig, new Set([empleadoId]));
    const inf = consolidar(cuestionarioPara(ciclo.cuestionario, part.es_lider), recibidas.get(empleadoId) ?? [], pesosDe(ciclo), ciclo.minimo_anonimato, calibraciones.get(empleadoId));
    const conDato = inf.competencias.filter(c => c.final !== null);
    const prioridad = (c: typeof conDato[number]) => (c.cuadrante === 'punto_ciego' ? 0 : c.cuadrante === 'oportunidad' ? 1 : 2);
    const elegidas = [...conDato].sort((a, b) => prioridad(a) - prioridad(b) || a.final! - b.final!).slice(0, 3);
    return {
      ciclo: { id: ciclo.id, nombre: ciclo.nombre },
      competencias: inf.competencias.map(c => ({
        id: c.id, nombre: c.nombre, final: c.final,
        sugerida: elegidas.some(e => e.id === c.id),
        motivo: c.cuadrante === 'punto_ciego' ? 'Punto ciego' : c.cuadrante === 'oportunidad' ? 'Oportunidad de desarrollo' : elegidas.some(e => e.id === c.id) ? 'Entre los resultados más bajos' : null,
      })),
    };
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const empleadoId = Number(new URL(request.url).searchParams.get('empleado'));
    const porId = new Map(ctx.todos.map(e => [e.id, e]));

    if (empleadoId) {
      const p = permisos(ctx, empleadoId);
      if (!p.ver) return errorJson('No tienes acceso al plan de esta persona.', 403);
      const [objetivos, checkins, sug] = await Promise.all([cargarObjetivos(ctx, [empleadoId]), cargarCheckins(ctx, [empleadoId]), sugerencias(ctx, empleadoId)]);
      const plan: PlanPersona = {
        persona: persona(porId.get(empleadoId), empleadoId),
        objetivos,
        checkins: checkins.map(c => ({ ...c, autor: c.registrado_por ? porId.get(c.registrado_por)?.nombre : undefined })),
        sugerencias: sug,
        permisos: { editar: p.editar, propio: p.propio },
        mesActual: claveMes(),
      };
      return NextResponse.json(plan);
    }

    // Resumen: yo + mi equipo (cascada); Admin/Auditor, todos los activos
    const miId = ctx.miBase?.id ?? null;
    const ids = ctx.alcance.tipo === 'empresa' ? ctx.activos.map(e => e.id) : [...(miId !== null ? [miId] : []), ...ctx.alcance.equipoIds];
    const [objetivos, checkins] = await Promise.all([cargarObjetivos(ctx, ids), cargarCheckins(ctx, ids)]);
    const resumen: ResumenDesarrollo = {
      mesActual: claveMes(),
      personas: ids.map(id => {
        const activos = objetivos.filter(o => o.empleado_id === id && o.estado === 'en_curso');
        const ultimo = checkins.find(c => c.empleado_id === id)?.periodo ?? null;
        return {
          persona: persona(porId.get(id), id),
          objetivos: activos.length,
          logrados: objetivos.filter(o => o.empleado_id === id && o.estado === 'logrado').length,
          avance: activos.length ? Math.round(activos.reduce((s, o) => s + avanceObjetivo(o), 0) / activos.length) : null,
          ultimoCheckin: ultimo,
          estadoCheckin: activos.length ? estadoCheckin(ultimo) : null,
          editable: permisos(ctx, id).editar,
          propio: id === miId,
        };
      }).sort((a, b) => Number(b.propio) - Number(a.propio) || Number(b.editable) - Number(a.editable) || a.persona.nombre.localeCompare(b.persona.nombre, 'es')),
    };
    return NextResponse.json(resumen);
  } catch (e) {
    console.error('Error en GET /api/desarrollo:', e);
    return errorJson(mensajeDeError(e), 500);
  }
}

interface Cuerpo {
  accion?: string; id?: number; empleado_id?: number; objetivo_id?: number;
  titulo?: string; resultado_esperado?: string | null; fecha_limite?: string | null; estado?: EstadoObjetivo;
  ciclo_id?: number | null; competencia_id?: number | null; competencia?: string | null;
  tipo?: TipoAccion; descripcion?: string; completada?: boolean;
  comentario?: string; proximos_pasos?: string | null;
}

export async function POST(request: Request) {
  try {
    const ctx = await contexto(request);
    if (ctx instanceof NextResponse) return ctx;
    const { admin, empresaId } = ctx;
    const miId = ctx.miBase?.id ?? null;
    const b = await request.json() as Cuerpo;
    const texto = (v: unknown, max = 1000) => String(v ?? '').trim().slice(0, max);
    const fecha = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });
    const sinPermiso = () => errorJson('Solo la persona, su líder directo o el Admin pueden editar este plan.', 403);

    const objetivoPorId = async (id: number) => {
      const { data, error: e } = await admin.from('pdi_objetivos').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle<Omit<ObjetivoPDI, 'acciones'>>();
      error(e);
      return data;
    };
    const accionPorId = async (id: number) => {
      const { data, error: e } = await admin.from('pdi_acciones').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle<AccionPDI>();
      error(e);
      return data;
    };
    const tocar = (objetivoId: number) => admin.from('pdi_objetivos').update({ actualizado_en: new Date().toISOString() }).eq('id', objetivoId);

    switch (b.accion) {
      case 'guardar_objetivo': {
        const previo = b.id ? await objetivoPorId(Number(b.id)) : null;
        if (b.id && !previo) return errorJson('El objetivo no existe.', 404);
        const empleadoId = previo ? previo.empleado_id : Number(b.empleado_id);
        if (!permisos(ctx, empleadoId).editar) return sinPermiso();
        const invalido = validarObjetivo(b);
        if (invalido) return errorJson(invalido, 400);
        if (!previo) {
          const { count } = await admin.from('pdi_objetivos').select('id', { count: 'exact', head: true }).eq('empleado_id', empleadoId).eq('estado', 'en_curso');
          if ((count ?? 0) >= MAX_OBJETIVOS_ACTIVOS) return errorJson(`Máximo ${MAX_OBJETIVOS_ACTIVOS} objetivos de desarrollo en curso: enfocarse en pocos da mejores resultados.`, 400);
        }
        // La competencia, si viene, debe ser de un ciclo de la empresa
        let cicloId: number | null = null, competenciaId: number | null = null, competencia: string | null = texto(b.competencia, 120) || null;
        if (b.ciclo_id && b.competencia_id) {
          const { data: ciclo } = await admin.from('ev360_ciclos').select('id, cuestionario').eq('id', Number(b.ciclo_id)).eq('empresa_id', empresaId).maybeSingle();
          const c = (ciclo?.cuestionario as { competencias?: { id: number; nombre: string }[] } | null)?.competencias?.find(x => x.id === Number(b.competencia_id));
          if (!c) return errorJson('La competencia no pertenece al ciclo.', 400);
          cicloId = ciclo!.id; competenciaId = c.id; competencia = c.nombre;
        }
        const fila = {
          titulo: texto(b.titulo, 200), resultado_esperado: texto(b.resultado_esperado), fecha_limite: fecha(b.fecha_limite),
          ciclo_id: cicloId, competencia_id: competenciaId, competencia, actualizado_en: new Date().toISOString(),
        };
        const { data, error: e } = previo
          ? await admin.from('pdi_objetivos').update(fila).eq('id', previo.id).select('id').single()
          : await admin.from('pdi_objetivos').insert({ ...fila, empresa_id: empresaId, empleado_id: empleadoId, creado_por: miId }).select('id').single();
        error(e);
        return ok({ id: data!.id });
      }
      case 'estado_objetivo': {
        const o = await objetivoPorId(Number(b.id));
        if (!o) return errorJson('El objetivo no existe.', 404);
        if (!permisos(ctx, o.empleado_id).editar) return sinPermiso();
        if (!b.estado || !ESTADOS.includes(b.estado)) return errorJson('Estado no válido.', 400);
        if (b.estado === 'en_curso' && o.estado !== 'en_curso') {
          const { count } = await admin.from('pdi_objetivos').select('id', { count: 'exact', head: true }).eq('empleado_id', o.empleado_id).eq('estado', 'en_curso');
          if ((count ?? 0) >= MAX_OBJETIVOS_ACTIVOS) return errorJson(`Ya hay ${MAX_OBJETIVOS_ACTIVOS} objetivos en curso.`, 400);
        }
        const { error: e } = await admin.from('pdi_objetivos').update({ estado: b.estado, actualizado_en: new Date().toISOString() }).eq('id', o.id);
        error(e);
        return ok();
      }
      case 'eliminar_objetivo': {
        const o = await objetivoPorId(Number(b.id));
        if (!o) return errorJson('El objetivo no existe.', 404);
        if (!permisos(ctx, o.empleado_id).editar) return sinPermiso();
        const { error: e } = await admin.from('pdi_objetivos').delete().eq('id', o.id);
        error(e);
        return ok();
      }
      case 'guardar_accion': {
        const previa = b.id ? await accionPorId(Number(b.id)) : null;
        if (b.id && !previa) return errorJson('La acción no existe.', 404);
        const o = await objetivoPorId(previa ? previa.objetivo_id : Number(b.objetivo_id));
        if (!o) return errorJson('El objetivo no existe.', 404);
        if (!permisos(ctx, o.empleado_id).editar) return sinPermiso();
        const descripcion = texto(b.descripcion, 500);
        if (descripcion.length < 5) return errorJson('Describe la acción concreta.', 400);
        if (!b.tipo || !TIPOS.includes(b.tipo)) return errorJson('Elige el tipo de acción (experiencia, relaciones o formación).', 400);
        const fila = { tipo: b.tipo, descripcion, fecha_limite: fecha(b.fecha_limite) };
        if (previa) {
          const { error: e } = await admin.from('pdi_acciones').update(fila).eq('id', previa.id);
          error(e);
        } else {
          const { count } = await admin.from('pdi_acciones').select('id', { count: 'exact', head: true }).eq('objetivo_id', o.id);
          if ((count ?? 0) >= 12) return errorJson('Máximo 12 acciones por objetivo.', 400);
          const { error: e } = await admin.from('pdi_acciones').insert({ ...fila, objetivo_id: o.id, empresa_id: empresaId, orden: count ?? 0 });
          error(e);
        }
        await tocar(o.id);
        return ok();
      }
      case 'marcar_accion': {
        const a = await accionPorId(Number(b.id));
        if (!a) return errorJson('La acción no existe.', 404);
        const o = await objetivoPorId(a.objetivo_id);
        if (!o || !permisos(ctx, o.empleado_id).editar) return sinPermiso();
        const completada = !!b.completada;
        const { error: e } = await admin.from('pdi_acciones').update({ completada, completada_en: completada ? new Date().toISOString() : null }).eq('id', a.id);
        error(e);
        await tocar(o.id);
        return ok();
      }
      case 'eliminar_accion': {
        const a = await accionPorId(Number(b.id));
        if (!a) return errorJson('La acción no existe.', 404);
        const o = await objetivoPorId(a.objetivo_id);
        if (!o || !permisos(ctx, o.empleado_id).editar) return sinPermiso();
        const { error: e } = await admin.from('pdi_acciones').delete().eq('id', a.id);
        error(e);
        return ok();
      }
      case 'registrar_checkin': {
        const empleadoId = Number(b.empleado_id);
        if (!permisos(ctx, empleadoId).editar) return sinPermiso();
        const comentario = texto(b.comentario, 2000);
        if (comentario.length < 10) return errorJson('Resume la conversación: avances, obstáculos y apoyo necesario.', 400);
        const { error: e } = await admin.from('pdi_checkins').upsert({
          empresa_id: empresaId, empleado_id: empleadoId, periodo: claveMes(), comentario,
          proximos_pasos: texto(b.proximos_pasos, 1000) || null, registrado_por: miId, created_at: new Date().toISOString(),
        }, { onConflict: 'empleado_id,periodo' });
        error(e);
        return ok();
      }
    }
    return errorJson('Acción no reconocida.', 400);
  } catch (e) {
    console.error('Error en POST /api/desarrollo:', e);
    return errorJson(mensajeDeError(e), 500);
  }
}
