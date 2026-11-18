// Reglas de cargos (tabla "puestos"): único por área + nombre normalizado. Funciones puras, las usan
// el formulario del colaborador, el catálogo de cargos y la carga masiva (navegador y servidor).
import type { Area, NivelCargo, Puesto } from './tipos'
import { normalizarNombre, limpiarNombre } from './similitud'

/** ¿areaId es igual a ancestroId o una de sus sub-áreas? */
export function estaDentroDe(areaId: number | null | undefined, ancestroId: number | null | undefined, areas: Area[]): boolean {
  if (areaId == null || ancestroId == null) return false;
  const padre = new Map(areas.map(a => [a.id, a.parent_id]));
  const vistos = new Set<number>();
  let actual: number | null | undefined = areaId;
  while (actual != null && !vistos.has(actual)) {
    if (actual === ancestroId) return true;
    vistos.add(actual);
    actual = padre.get(actual);
  }
  return false;
}

const nombreArea = (id: number | null | undefined, areas: Area[]) => areas.find(a => a.id === id)?.nombre;

/** "Analista · Finanzas" (el área se muestra si el nombre se repite en otras áreas o si se pide siempre). */
export function etiquetaCargo(p: Puesto, areas: Area[], puestos: Puesto[], siempreArea = false): string {
  if (p.area_id == null) return `${p.nombre} (sin área)`;
  const repetido = puestos.some(o => o.id !== p.id && normalizarNombre(o.nombre) === normalizarNombre(p.nombre));
  return siempreArea || repetido ? `${p.nombre} · ${nombreArea(p.area_id, areas) ?? 'área eliminada'}` : p.nombre;
}

export type ResolucionCargo =
  | { ok: true; puesto: Puesto; aviso?: string }
  | { ok: false; error: string; noExiste: boolean };

/**
 * Encuentra el cargo con ese nombre para alguien del área indicada:
 *  1. el de su misma área; 2. el de un área superior; 3. el único que exista en otra área (con aviso);
 *  4. uno antiguo sin área (con aviso). Si hay varios posibles en otras áreas, es ambiguo.
 */
export function resolverCargo(nombre: string, areaId: number | null, puestos: Puesto[], areas: Area[]): ResolucionCargo {
  const n = normalizarNombre(nombre);
  const mismos = puestos.filter(p => normalizarNombre(p.nombre) === n);
  if (mismos.length === 0) return { ok: false, noExiste: true, error: `El cargo "${nombre}" no existe.` };

  const enArea = mismos.find(p => p.area_id != null && p.area_id === areaId);
  if (enArea) return { ok: true, puesto: enArea };

  const deSuperior = mismos.filter(p => p.area_id != null && estaDentroDe(areaId, p.area_id, areas))
    .sort((a, b) => profundidad(b.area_id!, areas) - profundidad(a.area_id!, areas))[0];
  if (deSuperior) {
    return { ok: true, puesto: deSuperior, aviso: `El cargo "${deSuperior.nombre}" pertenece a "${nombreArea(deSuperior.area_id, areas)}", un área superior a la del colaborador.` };
  }

  const conArea = mismos.filter(p => p.area_id != null);
  if (conArea.length === 1) {
    const p = conArea[0];
    return { ok: true, puesto: p, aviso: areaId == null
      ? `El colaborador no tiene área; se usa el cargo "${p.nombre}" de "${nombreArea(p.area_id, areas)}".`
      : `El cargo "${p.nombre}" pertenece a "${nombreArea(p.area_id, areas)}", no al área del colaborador.` };
  }
  if (conArea.length > 1) {
    return { ok: false, noExiste: false, error: `El cargo "${nombre}" existe en varias áreas (${conArea.map(p => nombreArea(p.area_id, areas)).join(', ')}) y ninguna es la del colaborador: créalo en su área o corrige el área.` };
  }
  const antiguo = mismos[0];
  return { ok: true, puesto: antiguo, aviso: `El cargo "${antiguo.nombre}" aún no tiene área asignada: complétala en el catálogo de cargos.` };
}

function profundidad(areaId: number, areas: Area[]): number {
  const padre = new Map(areas.map(a => [a.id, a.parent_id]));
  let d = 0, actual: number | null | undefined = areaId;
  const vistos = new Set<number>();
  while (actual != null && !vistos.has(actual)) { vistos.add(actual); actual = padre.get(actual); d++; }
  return d;
}

/** Para un selector: cargos del área primero, luego los de sus áreas superiores, el resto y los sin área. */
export function agruparCargosParaArea(puestos: Puesto[], areaId: number | null, areas: Area[]) {
  const orden = (l: Puesto[]) => [...l].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const deArea = puestos.filter(p => areaId != null && p.area_id === areaId);
  const superiores = puestos.filter(p => p.area_id != null && p.area_id !== areaId && estaDentroDe(areaId, p.area_id, areas));
  const sinArea = puestos.filter(p => p.area_id == null);
  const usados = new Set([...deArea, ...superiores, ...sinArea].map(p => p.id));
  return {
    deArea: orden(deArea), superiores: orden(superiores),
    otras: orden(puestos.filter(p => !usados.has(p.id))), sinArea: orden(sinArea),
  };
}

export interface DatosCargo { nombre: string; area_id: string; nivel_id: string; descripcion: string }

/** Validación del alta/edición manual de un cargo. Devuelve el mensaje de error o null. */
export function validarCargo(d: DatosCargo, puestos: Puesto[], idEditado?: number): string | null {
  const nombre = limpiarNombre(d.nombre);
  if (!nombre) return 'Escribe el nombre del cargo.';
  if (nombre.length > 120) return 'El nombre es demasiado largo (máx. 120 caracteres).';
  if (!d.area_id) return 'Selecciona el área a la que pertenece el cargo.';
  const areaId = Number(d.area_id);
  const dup = puestos.find(p => p.id !== idEditado && (p.area_id ?? null) === areaId && normalizarNombre(p.nombre) === normalizarNombre(nombre));
  if (dup) return `Ya existe el cargo "${dup.nombre}" en esa área.`;
  return null;
}

export function payloadCargo(d: DatosCargo) {
  return {
    nombre: limpiarNombre(d.nombre),
    area_id: d.area_id ? Number(d.area_id) : null,
    nivel_id: d.nivel_id ? Number(d.nivel_id) : null,
    descripcion: d.descripcion.trim() || null,
  };
}

export const nombreNivel = (id: number | null | undefined, niveles: NivelCargo[]) => niveles.find(n => n.id === id)?.nombre ?? '';

/** Traduce el error del índice único de la BD a un mensaje claro. */
export function traducirErrorDuplicado(mensaje: string): string | null {
  if (/puestos_nombre_unico_idx/.test(mensaje)) return 'Ya existe un cargo con ese nombre en esa área (sin importar mayúsculas o tildes).';
  if (/areas_nombre_unico_idx/.test(mensaje)) return 'Ya existe un área con ese nombre (sin importar mayúsculas o tildes).';
  if (/niveles_cargo_nombre_unico_idx/.test(mensaje)) return 'Ya existe un nivel con ese nombre.';
  return null;
}
