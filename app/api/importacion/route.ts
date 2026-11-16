import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { exigirAdmin, errorJson } from '@/lib/servidor/supabaseAdmin'
import { porLotes } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import { analizarImportacion, MAX_FILAS, type FilaArchivo, type OpcionesImportacion, type FilaAnalizada } from '@/lib/importacion'
import { payloadEmpleado, parsearMonto } from '@/lib/colaboradores'
import { rolDesdeTipoPerfil } from '@/lib/roles'
import { estaActivo, type Area, type Compensacion, type Empleado, type Periodicidad, type Puesto } from '@/lib/tipos'
import type { ContextoImportacionApi, ResultadoAplicacion, ResultadoFila } from '@/lib/importacionApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * Importación masiva (solo Admin).
 *  GET  → datos que necesita el navegador para la vista previa (salarios vigentes, potencial evaluado, moneda).
 *  POST → vuelve a analizar el archivo AQUÍ (no se confía en el navegador) y aplica solo las filas confirmadas.
 */
export const dynamic = 'force-dynamic';

// Puntaje representativo (escala 1–5 de la evaluación de potencial) para el nivel cargado por Excel
const PUNTAJE_POR_NIVEL = { 1: 2.0, 2: 3.1, 3: 4.4 } as const;

export async function GET(request: Request) {
  const auth = await exigirAdmin(request);
  if (!auth.ok) return auth.respuesta;
  try {
    const { admin, perfil } = auth;
    const datos = await cargarDatosEmpresa(admin, perfil.empresa_id);
    const respuesta: ContextoImportacionApi = {
      monedaPrincipal: datos.monedaPrincipal,
      salarios: [...datos.salarios.entries()].map(([empleado_id, s]) => ({ empleado_id, ...s })),
      potencialEvaluadoIds: [...datos.potencialEvaluado],
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    return errorJson(`No se pudo preparar la importación: ${mensajeDeError(error)}`, 500);
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdmin(request);
  if (!auth.ok) return auth.respuesta;
  const { admin, perfil, usuario } = auth;
  const empresaId = perfil.empresa_id;

  try {
    const body = await request.json() as { filas?: FilaArchivo[]; opciones?: Partial<OpcionesImportacion>; confirmados?: string[] };
    const filasArchivo = Array.isArray(body.filas) ? body.filas.slice(0, MAX_FILAS + 1) : [];
    if (filasArchivo.length === 0) return errorJson('No hay filas para importar.', 400);
    if (filasArchivo.length > MAX_FILAS) return errorJson(`Máximo ${MAX_FILAS} filas por carga.`, 400);
    const opciones: OpcionesImportacion = { crearPuestos: !!body.opciones?.crearPuestos, crearAreas: !!body.opciones?.crearAreas };
    const confirmados = new Set((body.confirmados || []).map(e => String(e).trim().toLowerCase()));

    let datos = await cargarDatosEmpresa(admin, empresaId);
    const contexto = () => ({
      activos: datos.activos, desvinculados: datos.desvinculados, areas: datos.areas, puestos: datos.puestos,
      salariosVigentes: datos.salarios, emailImportador: usuario.email || '', monedaPorDefecto: datos.monedaPrincipal,
    });

    // 1. Crear puestos/áreas nuevos (si se autorizó) y volver a analizar con sus ids reales
    let analisis = analizarImportacion(filasArchivo, contexto(), opciones);
    const confirmadasValidas = (a: typeof analisis) => a.filas.filter(f => confirmados.has(f.email) && (f.accion === 'crear' || f.accion === 'actualizar'));
    const puestosACrear = opciones.crearPuestos ? nombresUsados(confirmadasValidas(analisis), 'puestoNombre', analisis.puestosNuevos) : [];
    const areasACrear = opciones.crearAreas ? nombresUsados(confirmadasValidas(analisis), 'areaNombre', analisis.areasNuevas) : [];
    if (puestosACrear.length > 0) {
      const { error } = await admin.from('puestos').insert(puestosACrear.map(nombre => ({ nombre, empresa_id: empresaId })));
      if (error) throw new Error(`No se pudieron crear los puestos: ${error.message}`);
    }
    if (areasACrear.length > 0) {
      const { error } = await admin.from('areas').insert(areasACrear.map(nombre => ({ nombre, empresa_id: empresaId, parent_id: null })));
      if (error) throw new Error(`No se pudieron crear las áreas: ${error.message}`);
    }
    if (puestosACrear.length + areasACrear.length > 0) {
      datos = await cargarDatosEmpresa(admin, empresaId);
      analisis = analizarImportacion(filasArchivo, contexto(), opciones);
    }

    // Solo filas confirmadas por el Admin que SIGUEN siendo válidas al re-analizar en el servidor
    const aAplicar = confirmadasValidas(analisis);
    const resultados: ResultadoFila[] = analisis.filas
      .filter(f => confirmados.has(f.email) && !aAplicar.includes(f))
      .map(f => ({ numero: f.numero, email: f.email, nombre: f.nombre, accion: f.accion, ok: false,
        mensaje: f.errores.join(' ') || 'Ya no hay cambios que aplicar.' }));

    const idPorEmail = new Map(datos.activos.map(e => [e.email.trim().toLowerCase(), e.id]));
    const empleadoPorId = new Map(datos.activos.map(e => [e.id, e]));
    const miEmpleadoId = idPorEmail.get((usuario.email || '').toLowerCase()) ?? null;
    const exitosas: FilaAnalizada[] = [];
    const creadosIds: number[] = [];
    const registrar = (f: FilaAnalizada, ok: boolean, mensaje?: string) =>
      resultados.push({ numero: f.numero, email: f.email, nombre: f.datos?.nombre || f.nombre, accion: f.accion, ok, mensaje, empleadoId: idPorEmail.get(f.email) });

    // 2. Altas y actualizaciones (sin jefe si el jefe se crea en este mismo archivo)
    for (const f of aAplicar) {
      const payload = payloadEmpleado(f.datos!, datos.puestos);
      if (f.jefeEmail && !idPorEmail.has(f.jefeEmail)) payload.jefe_directo_id = null; // se asigna en el paso 3
      try {
        if (f.accion === 'crear') {
          const { data, error } = await admin.from('empleados')
            .insert({ ...payload, email: f.email, cumplimiento_general: 0, empresa_id: empresaId }).select('id').single();
          if (error || !data) throw new Error(error?.message || 'No se pudo crear.');
          idPorEmail.set(f.email, data.id);
          creadosIds.push(data.id);
        } else {
          const anterior = empleadoPorId.get(f.empleadoId!)!;
          await liberarLiderazgos(admin, datos.areas, anterior, payload.tipo_perfil, payload.area_id);
          const { error } = await admin.from('empleados').update(payload).eq('id', f.empleadoId!).eq('empresa_id', empresaId);
          if (error) throw new Error(error.message);
        }
        exitosas.push(f);
      } catch (e) {
        registrar(f, false, traducirError(mensajeDeError(e)));
      }
    }

    // 3. Jefes que venían en el mismo archivo, líderes de área, salarios, potencial y permisos
    for (const f of exitosas) {
      const id = idPorEmail.get(f.email)!;
      const avisos: string[] = [];
      try {
        if (f.jefeEmail && idPorEmail.has(f.jefeEmail)) {
          const { error } = await admin.from('empleados').update({ jefe_directo_id: idPorEmail.get(f.jefeEmail) }).eq('id', id);
          if (error) avisos.push(`jefe: ${error.message}`);
        }
        if (f.datos!.tipo_perfil === 'Líder de Área' && f.datos!.area_id) {
          await admin.from('areas').update({ lider_id: id }).eq('id', Number(f.datos!.area_id)).eq('empresa_id', empresaId);
        }
        if (f.compensacion) {
          const c = f.compensacion;
          const { error } = await admin.from('compensaciones').insert({
            empleado_id: id, empresa_id: empresaId, salario: parsearMonto(c.salario), moneda: c.moneda,
            periodicidad: c.periodicidad, fecha_vigencia: c.fecha_vigencia, motivo: c.motivo || 'Carga masiva', creado_por: usuario.id,
          });
          if (error) avisos.push(`salario: ${error.message}`);
        }
        if (f.potencial) {
          const { error } = await admin.from('evaluaciones_potencial').insert({
            empleado_id: id, evaluador_id: miEmpleadoId, scores_dimensiones: [], puntaje_obtenido: PUNTAJE_POR_NIVEL[f.potencial],
            nivel_resultado: f.potencial, justificacion: 'Nivel de potencial cargado por importación masiva (Excel).',
          });
          if (error) avisos.push(`potencial: ${error.message}`);
          else await admin.from('empleados').update({ potencial_score: f.potencial }).eq('id', id);
        }
        // Si cambió su tipo de perfil y ya tiene cuenta, se actualizan sus permisos
        const anterior = f.empleadoId ? empleadoPorId.get(f.empleadoId) : undefined;
        if (anterior?.user_id && (anterior.tipo_perfil || 'Empleado') !== f.datos!.tipo_perfil) {
          const aviso = await sincronizarRol(admin, empresaId, anterior.user_id, rolDesdeTipoPerfil(f.datos!.tipo_perfil));
          if (aviso) avisos.push(aviso);
        }
      } catch (e) {
        avisos.push(mensajeDeError(e));
      }
      registrar(f, true, avisos.length ? `Guardado con avisos: ${avisos.join(' · ')}` : undefined);
    }

    const respuesta: ResultadoAplicacion = {
      resultados: resultados.sort((a, b) => a.numero - b.numero),
      creadosIds, puestosCreados: puestosACrear, areasCreadas: areasACrear,
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en /api/importacion:', error);
    return errorJson(`No se pudo completar la importación: ${mensajeDeError(error)}`, 500);
  }
}

// ------------------------------------------------------------------

async function cargarDatosEmpresa(admin: SupabaseClient, empresaId: number) {
  const [{ data: emp, error }, { data: areas }, { data: puestos }, { config }] = await Promise.all([
    admin.from('empleados').select('*').eq('empresa_id', empresaId).order('id'),
    admin.from('areas').select('*').eq('empresa_id', empresaId).order('id'),
    admin.from('puestos').select('*').eq('empresa_id', empresaId).order('nombre'),
    leerConfiguracion(admin, empresaId),
  ]);
  if (error) throw error;
  const todos = (emp || []) as Empleado[];
  const activos = todos.filter(estaActivo);
  const ids = activos.map(e => e.id);

  const hoy = new Date().toISOString().slice(0, 10);
  const comps = await porLotes(ids, async lote => {
    const { data, error: e } = await admin.from('compensaciones').select('*').in('empleado_id', lote).lte('fecha_vigencia', hoy)
      .order('fecha_vigencia', { ascending: false }).order('created_at', { ascending: false });
    if (e) throw e;
    return (data || []) as Compensacion[];
  }).catch(() => [] as Compensacion[]);
  const salarios = new Map<number, { salario: number; moneda: string; periodicidad: Periodicidad; fecha_vigencia: string }>();
  comps.forEach(c => { if (!salarios.has(c.empleado_id)) salarios.set(c.empleado_id, { salario: Number(c.salario), moneda: c.moneda, periodicidad: c.periodicidad, fecha_vigencia: c.fecha_vigencia }); });

  const evaluados = await porLotes(ids, async lote => {
    const { data, error: e } = await admin.from('evaluaciones_potencial').select('empleado_id').in('empleado_id', lote);
    if (e) throw e;
    return (data || []) as { empleado_id: number }[];
  }).catch(() => []);

  return {
    activos, desvinculados: todos.filter(e => !estaActivo(e)),
    areas: (areas || []) as Area[], puestos: (puestos || []) as Puesto[],
    salarios, potencialEvaluado: new Set(evaluados.map(e => e.empleado_id)),
    monedaPrincipal: config.moneda_principal,
  };
}

/** Nombres de puestos/áreas nuevos que realmente usa alguna fila confirmada. */
function nombresUsados(filas: FilaAnalizada[], campo: 'puestoNombre' | 'areaNombre', nuevos: string[]): string[] {
  const usados = new Set(filas.map(f => (f[campo] || '').toLowerCase()));
  return nuevos.filter(n => usados.has(n.toLowerCase()));
}

/** Mismas reglas que la edición manual: quien deja de ser líder o se va del área que lideraba la deja sin líder. */
async function liberarLiderazgos(admin: SupabaseClient, areas: Area[], anterior: Empleado, nuevoTipo: string, nuevaAreaId: number | null) {
  const dejaDeSerLider = anterior.tipo_perfil === 'Líder de Área' && !['Líder de Área', 'Manager', 'Admin'].includes(nuevoTipo);
  const pierden = areas.filter(a => a.lider_id === anterior.id && (dejaDeSerLider || (a.id === anterior.area_id && a.id !== nuevaAreaId)));
  if (pierden.length > 0) await admin.from('areas').update({ lider_id: null }).in('id', pierden.map(a => a.id));
}

/** Actualiza perfiles.rol sin dejar a la empresa sin Admin. Devuelve un aviso si no se pudo. */
async function sincronizarRol(admin: SupabaseClient, empresaId: number, userId: string, rol: string): Promise<string | null> {
  if (rol !== 'admin') {
    const { data: actual } = await admin.from('perfiles').select('rol').eq('id', userId).maybeSingle();
    if (actual?.rol === 'admin') {
      const { count } = await admin.from('perfiles').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('rol', 'admin').neq('id', userId);
      if ((count ?? 0) === 0) return 'permisos: es el único Admin, no se le quitó el rol';
    }
  }
  const { error } = await admin.from('perfiles').update({ rol }).eq('id', userId).eq('empresa_id', empresaId);
  return error ? `permisos: ${error.message}` : null;
}

function traducirError(m: string): string {
  if (/empleados_documento_unico_idx/.test(m)) return 'Ese documento ya está registrado para otro colaborador.';
  if (/duplicate key/.test(m)) return 'Registro duplicado.';
  return m;
}
