import type { Area, Empleado } from './tipos'

// Nodo del árbol de áreas: el área, sus sub-áreas y la ruta de ancestros (de la raíz al padre)
export interface NodoArea {
  area: Area;
  hijos: NodoArea[];
  ruta: Area[];
}

const porNombre = (a: Area, b: Area) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

/**
 * Arma el árbol de áreas según parent_id.
 * Son raíz las áreas sin padre o cuyo padre no está en la lista (p. ej. la vista en cascada de un Manager).
 * Si por error hubiera un ciclo (A depende de B y B de A), esas áreas se muestran como raíz para no perderlas.
 */
export function construirJerarquia(areas: Area[]): NodoArea[] {
  const ids = new Set(areas.map(a => a.id));
  const hijosDe = new Map<number, Area[]>();
  areas.forEach(a => {
    if (a.parent_id && ids.has(a.parent_id) && a.parent_id !== a.id) {
      hijosDe.set(a.parent_id, [...(hijosDe.get(a.parent_id) || []), a]);
    }
  });

  const visitadas = new Set<number>();
  const armar = (area: Area, ruta: Area[]): NodoArea => {
    visitadas.add(area.id);
    const hijos = (hijosDe.get(area.id) || [])
      .filter(h => !visitadas.has(h.id))
      .sort(porNombre)
      .map(h => armar(h, [...ruta, area]));
    return { area, hijos, ruta };
  };

  const raices = areas
    .filter(a => !a.parent_id || !ids.has(a.parent_id) || a.parent_id === a.id)
    .sort(porNombre)
    .map(a => armar(a, []));

  // Áreas atrapadas en un ciclo: nunca se alcanzan desde una raíz
  areas.filter(a => !visitadas.has(a.id)).sort(porNombre).forEach(a => {
    if (!visitadas.has(a.id)) raices.push(armar(a, []));
  });

  return raices;
}

/** IDs de todas las sub-áreas (a cualquier profundidad) de un área. */
export function idsDescendientes(areaId: number, areas: Area[]): Set<number> {
  const resultado = new Set<number>();
  let frontera = [areaId];
  while (frontera.length > 0) {
    const siguientes = areas.filter(a => a.parent_id !== null && frontera.includes(a.parent_id) && !resultado.has(a.id) && a.id !== areaId);
    siguientes.forEach(a => resultado.add(a.id));
    frontera = siguientes.map(a => a.id);
  }
  return resultado;
}

// --- Búsqueda ---

/** Minúsculas y sin tildes, para que "gutierrez" encuentre "Gutiérrez". */
export const normalizarTexto = (texto: string | null | undefined) =>
  (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function coincideEmpleado(emp: Empleado, consultaNormalizada: string): boolean {
  if (!consultaNormalizada) return true;
  return [emp.nombre, emp.email, emp.puesto, emp.tipo_perfil].some(campo => normalizarTexto(campo).includes(consultaNormalizada));
}

export interface ResultadoFiltro {
  nodos: NodoArea[];
  /** Áreas cuyo nombre coincide (se muestran con todos sus colaboradores) */
  areasCoincidentes: Set<number>;
  /** Por área: colaboradores que coinciden con la búsqueda */
  empleadosCoincidentesPorArea: Map<number, Empleado[]>;
  totalAreas: number;
  totalEmpleados: number;
}

/**
 * Poda el árbol dejando solo las áreas que coinciden (por nombre o por algún colaborador)
 * y sus ancestros, para no perder el contexto jerárquico.
 */
export function filtrarJerarquia(nodos: NodoArea[], empleados: Empleado[], consulta: string): ResultadoFiltro {
  const q = normalizarTexto(consulta);
  const areasCoincidentes = new Set<number>();
  const empleadosCoincidentesPorArea = new Map<number, Empleado[]>();
  let totalEmpleados = 0;

  const podar = (nodo: NodoArea): NodoArea | null => {
    const hijos = nodo.hijos.map(podar).filter((n): n is NodoArea => n !== null);
    const coincideArea = normalizarTexto(nodo.area.nombre).includes(q);
    const empCoinciden = empleados.filter(e => e.area_id === nodo.area.id && coincideEmpleado(e, q));
    if (coincideArea) areasCoincidentes.add(nodo.area.id);
    if (empCoinciden.length > 0) {
      empleadosCoincidentesPorArea.set(nodo.area.id, empCoinciden);
      totalEmpleados += empCoinciden.length;
    }
    if (!coincideArea && empCoinciden.length === 0 && hijos.length === 0) return null;
    return { ...nodo, hijos };
  };

  const filtrados = nodos.map(podar).filter((n): n is NodoArea => n !== null);
  return { nodos: filtrados, areasCoincidentes, empleadosCoincidentesPorArea, totalAreas: areasCoincidentes.size, totalEmpleados };
}
