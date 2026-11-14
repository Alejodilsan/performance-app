import { NextResponse } from 'next/server'
import { crearClienteAdmin, usuarioDesdeRequest, errorJson } from '@/lib/servidor/supabaseAdmin'
import { calcularAlcance } from '@/lib/alcance'
import { estaActivo, type Area, type Empleado, type Evaluacion, type Perfil, type Plan } from '@/lib/tipos'
import type { EntradaDirectorio, RespuestaDatos } from '@/lib/datos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Devuelve SOLO lo que el usuario puede ver según su perfil y la jerarquía de áreas (ver lib/alcance.ts).
 * El filtrado se hace aquí, en el servidor: el navegador nunca recibe datos de desempeño fuera de su alcance.
 */
const SELECT_FICHA = '*, indicadores(*), planes_mejora(*, comentarios(*)), historico:historico_cumplimiento(*)';
const LOTE = 150; // ids por consulta (evita URLs demasiado largas)

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const admin = crearClienteAdmin();
    const usuario = await usuarioDesdeRequest(request, admin);
    if (!usuario) return errorJson('Sesión no válida.', 401);

    const { data: perfil } = await admin.from('perfiles').select('*').eq('id', usuario.id).maybeSingle<Perfil>();
    if (!perfil?.empresa_id) return NextResponse.json({ estado: 'sin_perfil' } satisfies RespuestaDatos);
    const empresaId = perfil.empresa_id;

    const [{ data: areasDB }, { data: puestos }, { data: empresa }, { data: todosDB, error: errEmp }] = await Promise.all([
      admin.from('areas').select('*').eq('empresa_id', empresaId).order('id'),
      admin.from('puestos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
      admin.from('empresas').select('nombre').eq('id', empresaId).maybeSingle(),
      admin.from('empleados').select('*').eq('empresa_id', empresaId).order('id'),
    ]);
    if (errEmp) throw errEmp;
    const areas = (areasDB || []) as Area[];
    const todos = (todosDB || []) as Empleado[];

    // Su ficha: por cuenta vinculada o por correo (sin distinguir mayúsculas)
    const email = (usuario.email || '').trim().toLowerCase();
    const miBase = todos.find(e => e.user_id === usuario.id) || todos.find(e => e.email?.trim().toLowerCase() === email) || null;
    if (miBase && !estaActivo(miBase)) return NextResponse.json({ estado: 'desvinculado' } satisfies RespuestaDatos);

    const activos = todos.filter(estaActivo);
    const alcance = calcularAlcance(perfil.rol, miBase?.id ?? null, areas, activos);
    const esEmpresa = alcance.tipo === 'empresa';

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
    const idsEmpresa = todos.map(e => e.id);
    if (esEmpresa) {
      evaluaciones = await porLotes(idsEmpresa, async lote => {
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
      areas, puestos: puestos || [], empleados: fichas, evaluaciones, directorio, monedaPreferida,
    };
    return NextResponse.json(respuesta);
  } catch (error) {
    console.error('Error en /api/datos:', error);
    return errorJson(`No se pudieron cargar los datos: ${mensajeDeError(error)}`, 500);
  }
}

async function porLotes<T>(ids: number[], consulta: (lote: number[]) => Promise<T[]>): Promise<T[]> {
  const resultado: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    if (lote.length > 0) resultado.push(...(await consulta(lote)));
  }
  return resultado;
}

const ordenarPlanes = (emp: Empleado): Empleado => ({
  ...emp,
  planes_mejora: [...(emp.planes_mejora || [])].sort((a: Plan, b: Plan) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
});
