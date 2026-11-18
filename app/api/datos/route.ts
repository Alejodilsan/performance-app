import { NextResponse } from 'next/server'
import { errorJson } from '@/lib/servidor/supabaseAdmin'
import { obtenerContextoSesion, porLotes } from '@/lib/servidor/contexto'
import { leerConfiguracion } from '@/lib/servidor/configuracion'
import { estaActivo, type Empleado, type Evaluacion, type Plan } from '@/lib/tipos'
import type { EntradaDirectorio, RespuestaDatos } from '@/lib/datos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Devuelve SOLO lo que el usuario puede ver según su perfil y la jerarquía de áreas (ver lib/alcance.ts).
 * El filtrado se hace aquí, en el servidor: el navegador nunca recibe datos de desempeño fuera de su alcance.
 */
const SELECT_FICHA = '*, indicadores(*), planes_mejora(*, comentarios(*)), historico:historico_cumplimiento(*)';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await obtenerContextoSesion(request);
    if (ctx.estado === 'sin_sesion') return errorJson('Sesión no válida.', 401);
    if (ctx.estado !== 'ok') return NextResponse.json({ estado: ctx.estado } satisfies RespuestaDatos);
    const { admin, perfil, empresaId, areas, todos, activos, miBase, alcance } = ctx;
    const esEmpresa = alcance.tipo === 'empresa';

    const [{ data: puestos }, { data: niveles }, { data: empresa }, { config }] = await Promise.all([
      admin.from('puestos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
      // Vacío si la migración 20261119 aún no se aplicó
      admin.from('niveles_cargo').select('*').eq('empresa_id', empresaId).order('orden', { ascending: true }),
      admin.from('empresas').select('nombre').eq('id', empresaId).maybeSingle(),
      leerConfiguracion(admin, empresaId),
    ]);

    // Fichas completas: toda la empresa (Admin con desvinculados) o solo su equipo + él mismo
    let fichas: Empleado[] = [];
    if (esEmpresa) {
      const { data, error } = await admin.from('empleados').select(SELECT_FICHA).eq('empresa_id', empresaId).order('id');
      if (error) throw error;
      fichas = (data || []) as Empleado[];
      if (perfil.rol !== 'admin') fichas = fichas.filter(estaActivo); // el Auditor no ve desvinculados
    } else {
      const ids = [...alcance.equipoIds, ...(miBase ? [miBase.id] : [])];
      fichas = await porLotes(ids, async lote => {
        const { data, error } = await admin.from('empleados').select(SELECT_FICHA).in('id', lote).eq('empresa_id', empresaId);
        if (error) throw error;
        return (data || []) as Empleado[];
      });
    }
    fichas = fichas.map(ordenarPlanes).sort((a, b) => a.id - b.id);
    const miEmpleado = miBase ? fichas.find(f => f.id === miBase.id) ?? null : null;

    // Evaluaciones: Admin/Auditor todas las de la empresa. El resto: las que hizo y las que recibió su equipo
    // (no las que recibió él mismo de su equipo, para proteger la confidencialidad de la evaluación ascendente).
    let evaluaciones: Evaluacion[] = [];
    if (esEmpresa) {
      evaluaciones = await porLotes(todos.map(e => e.id), async lote => {
        const { data, error } = await admin.from('evaluaciones').select('*').in('evaluado_id', lote);
        if (error) throw error;
        return (data || []) as Evaluacion[];
      });
    } else if (miBase) {
      const [hechas, deEquipo] = await Promise.all([
        admin.from('evaluaciones').select('*').eq('evaluador_id', miBase.id),
        porLotes(alcance.equipoIds, async lote => {
          const { data, error } = await admin.from('evaluaciones').select('*').in('evaluado_id', lote);
          if (error) throw error;
          return (data || []) as Evaluacion[];
        }),
      ]);
      const mapa = new Map<number, Evaluacion>();
      [...(hechas.data || []), ...deEquipo].forEach(ev => mapa.set(ev.id, ev));
      evaluaciones = [...mapa.values()];
    }

    // Organigrama informativo: todos los activos, sin datos de desempeño
    const directorio: EntradaDirectorio[] = activos.map(e => ({
      id: e.id, nombre: e.nombre, puesto: e.puesto, area_id: e.area_id, jefe_directo_id: e.jefe_directo_id ?? null,
    }));

    let monedaPreferida: string | null = null;
    if (perfil.rol === 'admin') {
      const { data } = await admin.from('compensaciones').select('moneda').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      monedaPreferida = data?.moneda ?? null;
    }

    const respuesta: RespuestaDatos = {
      estado: 'ok', perfil, nombreEmpresa: empresa?.nombre || '', miEmpleado, alcance,
      areas, puestos: puestos || [], niveles: niveles || [], empleados: fichas, evaluaciones, directorio, monedaPreferida,
      umbrales: { umbral_desempeno_bajo: config.umbral_desempeno_bajo, umbral_desempeno_alto: config.umbral_desempeno_alto },
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en /api/datos:', error);
    return errorJson(`No se pudieron cargar los datos: ${mensajeDeError(error)}`, 500);
  }
}

const ordenarPlanes = (emp: Empleado): Empleado => ({
  ...emp,
  planes_mejora: [...(emp.planes_mejora || [])].sort((a: Plan, b: Plan) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
});
