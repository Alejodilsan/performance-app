import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { exigirAdmin, errorJson } from '@/lib/servidor/supabaseAdmin'
import { porLotes } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import { MAX_FILAS, type OpcionesImportacion, type FilaAnalizada } from '@/lib/importacion'
import { analizarCarga, filaValida, type ContextoCarga, type Decisiones, type LibroCarga, type ResultadoCarga } from '@/lib/estructura'
import { payloadEmpleado, parsearMonto, emailNormalizado } from '@/lib/colaboradores'
import { traducirErrorDuplicado } from '@/lib/cargos'
import { normalizarNombre } from '@/lib/similitud'
import { rolDesdeTipoPerfil } from '@/lib/roles'
import { estaActivo, type Area, type Compensacion, type Empleado, type NivelCargo, type Periodicidad, type Puesto, type RangoSalarialCargo } from '@/lib/tipos'
import type { ConfirmadosCarga, ContextoImportacionApi, ResultadoAplicacion, ResultadoFila } from '@/lib/importacionApi'
import { mensajeDeError } from '@/lib/errores'

/**
 * Carga masiva (solo Admin): hojas Áreas, Cargos y Colaboradores.
 *  GET  → datos que necesita el navegador para la vista previa (salarios, rangos, niveles, potencial evaluado, moneda).
 *  POST → vuelve a analizar el libro AQUÍ (no se confía en el navegador) y aplica solo lo confirmado que siga siendo válido,
 *         en orden: niveles → áreas (y sus áreas superiores) → cargos → colaboradores → líderes de área.
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
      niveles: datos.niveles,
      rangos: [...datos.rangos.values()],
      migracionPendiente: datos.migracionPendiente,
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
    const body = await request.json() as { libro?: Partial<LibroCarga>; opciones?: Partial<OpcionesImportacion>; decisiones?: Decisiones; confirmados?: Partial<ConfirmadosCarga> };
    const hoja = <T>(v: T[] | undefined) => (Array.isArray(v) ? v.slice(0, MAX_FILAS + 1) : []);
    const libro: LibroCarga = { areas: hoja(body.libro?.areas), cargos: hoja(body.libro?.cargos), colaboradores: hoja(body.libro?.colaboradores) };
    if (libro.areas.length + libro.cargos.length + libro.colaboradores.length === 0) return errorJson('No hay filas para importar.', 400);
    if ([libro.areas, libro.cargos, libro.colaboradores].some(h => h.length > MAX_FILAS)) return errorJson(`Máximo ${MAX_FILAS} filas por hoja.`, 400);
    const opciones: OpcionesImportacion = { crearPuestos: !!body.opciones?.crearPuestos, crearAreas: !!body.opciones?.crearAreas };
    const decisiones: Decisiones = {};
    Object.entries(body.decisiones || {}).forEach(([k, v]) => { if (typeof v === 'string') decisiones[String(k)] = v; });
    const conjunto = (l?: string[]) => new Set((l || []).map(x => String(x).trim().toLowerCase()));
    const confirmados = { areas: conjunto(body.confirmados?.areas), cargos: conjunto(body.confirmados?.cargos), colaboradores: conjunto(body.confirmados?.colaboradores) };

    const datos = await cargarDatosEmpresa(admin, empresaId);
    if (datos.migracionPendiente) return errorJson('Falta aplicar la migración 20261119_cargos_estructura.sql en Supabase (SQL Editor).', 400);
    const ctx = (): ContextoCarga => ({
      activos: datos.activos, desvinculados: datos.desvinculados, areas: datos.areas, puestos: datos.puestos, niveles: datos.niveles,
      rangos: datos.rangos, salariosVigentes: datos.salarios, emailImportador: usuario.email || '', monedaPorDefecto: datos.monedaPrincipal,
    });
    const recargarEstructura = async () => Object.assign(datos, await cargarEstructura(admin, empresaId));
    const analizar = () => analizarCarga(libro, ctx(), opciones, decisiones);

    let analisis = analizar();
    if (analisis.pendientes > 0) return errorJson(`Hay ${analisis.pendientes} nombre(s) parecido(s) sin decidir: revisa "Posibles duplicados".`, 400);

    const areasOk = (a: ResultadoCarga) => a.areas.filter(f => filaValida(f) && confirmados.areas.has(f.clave));
    const cargosOk = (a: ResultadoCarga) => a.cargos.filter(f => filaValida(f) && confirmados.cargos.has(f.clave));
    const avisosEstructura: string[] = [];
    const aviso = (m: string, e: { message: string }) => avisosEstructura.push(`${m}: ${traducirErrorDuplicado(e.message) || e.message}`);

    // 1. Niveles nuevos que usan los cargos confirmados
    const usados = new Set(cargosOk(analisis).map(f => normalizarNombre(f.nivelNombre)));
    const nivelesACrear = analisis.nivelesNuevos.filter(n => usados.has(normalizarNombre(n)));
    if (nivelesACrear.length > 0) {
      const base = Math.max(0, ...datos.niveles.map(n => n.orden));
      const { error } = await admin.from('niveles_cargo').insert(nivelesACrear.map((nombre, i) => ({ nombre, empresa_id: empresaId, orden: base + i + 1 })));
      if (error) throw new Error(`No se pudieron crear los niveles: ${traducirErrorDuplicado(error.message) || error.message}`);
    }

    // 2. Áreas: primero se crean todas (sin área superior) y luego se ubican, así el orden de las filas no importa
    const areasCreadas: string[] = [];
    for (const f of areasOk(analisis).filter(f => f.accion === 'crear')) {
      const { error } = await admin.from('areas').insert({ nombre: f.nombre, empresa_id: empresaId, parent_id: null });
      if (error) aviso(`Área "${f.nombre}"`, error); else areasCreadas.push(f.nombre);
    }
    await recargarEstructura();
    const idArea = (nombre: string) => datos.areas.find(a => normalizarNombre(a.nombre) === normalizarNombre(nombre))?.id;
    for (const f of areasOk(analisis).filter(f => f.padreNombre !== undefined)) {
      const id = idArea(f.nombre);
      if (!id) continue;
      const padre = f.padreNombre ? idArea(f.padreNombre) ?? null : null;
      if (f.padreNombre && padre === null) continue;
      const { error } = await admin.from('areas').update({ parent_id: padre }).eq('id', id).eq('empresa_id', empresaId);
      if (error) aviso(`Ubicar "${f.nombre}"`, error);
    }
    await recargarEstructura();
    analisis = analizar();

    // 3. Cargos (con su nivel y rango salarial)
    const cargosCreados: string[] = [];
    const idNivel = (nombre?: string) => (nombre ? datos.niveles.find(n => normalizarNombre(n.nombre) === normalizarNombre(nombre))?.id ?? null : undefined);
    for (const f of cargosOk(analisis)) {
      const areaId = idArea(f.areaNombre || '');
      if (!areaId) continue;
      const cambios: Record<string, unknown> = { area_id: areaId };
      const nivel = idNivel(f.nivelNombre);
      if (nivel !== undefined) cambios.nivel_id = nivel;
      if (f.descripcion) cambios.descripcion = f.descripcion;
      let puestoId: number | undefined;
      if (f.accion === 'crear') {
        const { data, error } = await admin.from('puestos').insert({ ...cambios, nombre: f.nombre, empresa_id: empresaId }).select('id').single();
        if (error || !data) { aviso(`Cargo "${f.nombre}" (${f.areaNombre})`, error || { message: 'no se pudo crear' }); continue; }
        puestoId = data.id; cargosCreados.push(`${f.nombre} (${f.areaNombre})`);
      } else {
        // Mismo cargo en su área, o uno antiguo sin área que esta fila completa
        const p = datos.puestos.find(x => x.area_id === areaId && normalizarNombre(x.nombre) === normalizarNombre(f.nombre))
          ?? datos.puestos.find(x => x.area_id == null && normalizarNombre(x.nombre) === normalizarNombre(f.nombre));
        if (!p) continue;
        const { error } = await admin.from('puestos').update(cambios).eq('id', p.id).eq('empresa_id', empresaId);
        if (error) { aviso(`Cargo "${f.nombre}"`, error); continue; }
        puestoId = p.id;
      }
      if (f.rango && puestoId) {
        const { error } = await admin.from('rangos_salariales_cargo').upsert({
          puesto_id: puestoId, empresa_id: empresaId, salario_min: f.rango.min, salario_max: f.rango.max, moneda: f.rango.moneda, updated_at: new Date().toISOString(),
        });
        if (error) aviso(`Rango de "${f.nombre}"`, error);
      }
    }
    await recargarEstructura();
    analisis = analizar();

    // 4. Áreas y cargos que se crean desde la hoja Colaboradores (si se autorizó)
    const confirmadasValidas = (a: ResultadoCarga) => a.colaboradores.filas.filter(f => confirmados.colaboradores.has(f.email) && filaValida(f));
    const areasAuto = opciones.crearAreas ? nombresUsados(confirmadasValidas(analisis), 'areaNombre', analisis.colaboradores.areasNuevas) : [];
    if (areasAuto.length > 0) {
      const { error } = await admin.from('areas').insert(areasAuto.map(nombre => ({ nombre, empresa_id: empresaId, parent_id: null })));
      if (error) throw new Error(`No se pudieron crear las áreas: ${traducirErrorDuplicado(error.message) || error.message}`);
      areasCreadas.push(...areasAuto);
      await recargarEstructura();
      analisis = analizar();
    }
    const usadosAuto = new Set(confirmadasValidas(analisis).map(f => `${normalizarNombre(f.areaNombre)}|${normalizarNombre(f.puestoNombre)}`));
    const cargosAuto = opciones.crearPuestos ? analisis.colaboradores.puestosNuevos.filter(c => usadosAuto.has(`${normalizarNombre(c.areaNombre)}|${normalizarNombre(c.nombre)}`)) : [];
    if (cargosAuto.length > 0) {
      const filas = cargosAuto.map(c => ({ nombre: c.nombre, area_id: idArea(c.areaNombre) ?? null, empresa_id: empresaId })).filter(c => c.area_id);
      const { error } = await admin.from('puestos').insert(filas);
      if (error) throw new Error(`No se pudieron crear los cargos: ${traducirErrorDuplicado(error.message) || error.message}`);
      cargosCreados.push(...cargosAuto.map(c => `${c.nombre} (${c.areaNombre})`));
      await recargarEstructura();
      analisis = analizar();
    }

    // 5. Colaboradores: solo filas confirmadas por el Admin que SIGUEN siendo válidas al re-analizar en el servidor
    const aAplicar = confirmadasValidas(analisis);
    const resultados: ResultadoFila[] = analisis.colaboradores.filas
      .filter(f => confirmados.colaboradores.has(f.email) && !aAplicar.includes(f))
      .map(f => ({ numero: f.numero, email: f.email, nombre: f.nombre, accion: f.accion, ok: false,
        mensaje: f.errores.join(' ') || 'Ya no hay cambios que aplicar.' }));

    const idPorEmail = new Map(datos.activos.filter(e => emailNormalizado(e.email)).map(e => [emailNormalizado(e.email), e.id]));
    const empleadoPorId = new Map(datos.activos.map(e => [e.id, e]));
    const miEmpleadoId = idPorEmail.get((usuario.email || '').toLowerCase()) ?? null;
    const exitosas: FilaAnalizada[] = [];
    const creadosIds: number[] = [];
    const registrar = (f: FilaAnalizada, ok: boolean, mensaje?: string) =>
      resultados.push({ numero: f.numero, email: f.email, nombre: f.datos?.nombre || f.nombre, accion: f.accion, ok, mensaje, empleadoId: idPorEmail.get(f.email) });

    // 5a. Altas y actualizaciones (sin jefe si el jefe se crea en este mismo archivo)
    for (const f of aAplicar) {
      const payload = payloadEmpleado(f.datos!, datos.puestos);
      if (f.jefeEmail && !idPorEmail.has(f.jefeEmail)) payload.jefe_directo_id = null; // se asigna en el paso 5b
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

    // 5b. Jefes que venían en el mismo archivo, líderes de área, salarios, potencial y permisos
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
          const avisoRol = await sincronizarRol(admin, empresaId, anterior.user_id, rolDesdeTipoPerfil(f.datos!.tipo_perfil));
          if (avisoRol) avisos.push(avisoRol);
        }
      } catch (e) {
        avisos.push(mensajeDeError(e));
      }
      registrar(f, true, avisos.length ? `Guardado con avisos: ${avisos.join(' · ')}` : undefined);
    }

    // 6. Líderes que define la hoja Áreas (al final: pueden ser personas recién creadas)
    for (const f of areasOk(analisis).filter(f => f.liderEmail)) {
      const id = idPorEmail.get(f.liderEmail!);
      const areaId = idArea(f.nombre);
      if (!id || !areaId) { avisosEstructura.push(`Líder de "${f.nombre}": ${f.liderEmail} no quedó creado.`); continue; }
      const { error } = await admin.from('areas').update({ lider_id: id }).eq('id', areaId).eq('empresa_id', empresaId);
      if (error) aviso(`Líder de "${f.nombre}"`, error);
    }

    const respuesta: ResultadoAplicacion = {
      resultados: resultados.sort((a, b) => a.numero - b.numero),
      creadosIds, puestosCreados: cargosCreados, areasCreadas, nivelesCreados: nivelesACrear,
      areasAplicadas: areasOk(analisis).length, cargosAplicados: cargosOk(analisis).length, avisosEstructura,
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en /api/importacion:', error);
    return errorJson(`No se pudo completar la importación: ${mensajeDeError(error)}`, 500);
  }
}

// ------------------------------------------------------------------

/** Áreas, cargos, niveles y rangos salariales (se recargan entre pasos para tener los ids reales). */
async function cargarEstructura(admin: SupabaseClient, empresaId: number) {
  const [{ data: areas, error: eA }, { data: puestos, error: eP }, { data: niveles, error: eN }, { data: rangos }] = await Promise.all([
    admin.from('areas').select('*').eq('empresa_id', empresaId).order('id'),
    admin.from('puestos').select('*').eq('empresa_id', empresaId).order('nombre'),
    // Si la migración 20261119 aún no se aplicó, estas dos fallan y se toman vacías
    admin.from('niveles_cargo').select('*').eq('empresa_id', empresaId).order('orden'),
    admin.from('rangos_salariales_cargo').select('*').eq('empresa_id', empresaId),
  ]);
  if (eA) throw eA;
  if (eP) throw eP;
  return {
    migracionPendiente: !!eN,
    areas: (areas || []) as Area[],
    puestos: (puestos || []) as Puesto[],
    niveles: (niveles || []) as NivelCargo[],
    rangos: new Map(((rangos || []) as RangoSalarialCargo[]).map(r => [r.puesto_id, {
      puesto_id: r.puesto_id, moneda: r.moneda,
      salario_min: r.salario_min === null ? null : Number(r.salario_min), salario_max: r.salario_max === null ? null : Number(r.salario_max),
    }])),
  };
}

async function cargarDatosEmpresa(admin: SupabaseClient, empresaId: number) {
  const [{ data: emp, error }, estructura, { config }] = await Promise.all([
    admin.from('empleados').select('*').eq('empresa_id', empresaId).order('id'),
    cargarEstructura(admin, empresaId),
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
    ...estructura,
    salarios, potencialEvaluado: new Set(evaluados.map(e => e.empleado_id)),
    monedaPrincipal: config.moneda_principal,
  };
}

/** Nombres de áreas nuevas que realmente usa alguna fila confirmada. */
function nombresUsados(filas: FilaAnalizada[], campo: 'areaNombre', nuevos: string[]): string[] {
  const usados = new Set(filas.map(f => normalizarNombre(f[campo])));
  return nuevos.filter(n => usados.has(normalizarNombre(n)));
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
  const dup = traducirErrorDuplicado(m);
  if (dup) return dup;
  if (/empleados_documento_unico_idx/.test(m)) return 'Ese documento ya está registrado para otro colaborador.';
  if (/duplicate key/.test(m)) return 'Registro duplicado.';
  return m;
}
