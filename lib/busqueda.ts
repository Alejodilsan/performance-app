// Buscador global del encabezado: resultados por persona y área, con resaltado de la coincidencia. Funciones puras.
import type { Area, Empleado } from './tipos'
import { normalizarTexto } from './jerarquia'

export interface Segmento { texto: string; coincide: boolean }

/**
 * Parte un texto en segmentos que coinciden / no coinciden con la consulta, sin distinguir mayúsculas ni tildes
 * ("logis" resalta "Logís" en "Logística"). Conserva el texto original.
 */
export function resaltar(texto: string, consulta: string): Segmento[] {
  const q = normalizarTexto(consulta);
  if (!q || !texto) return [{ texto: texto || '', coincide: false }];
  // Normaliza carácter a carácter para conservar la posición de cada letra en el texto original
  const chars = [...texto];
  const norm = chars.map(c => normalizarTexto(c) || c.toLowerCase());
  const plano = norm.join('');
  const marcas = new Array(chars.length).fill(false);
  // Índice en el texto plano → índice del carácter original
  const origen: number[] = [];
  norm.forEach((n, i) => { for (let k = 0; k < n.length; k++) origen.push(i); });
  let desde = 0;
  while (true) {
    const pos = plano.indexOf(q, desde);
    if (pos === -1) break;
    for (let k = pos; k < pos + q.length; k++) marcas[origen[k]] = true;
    desde = pos + q.length;
  }
  const segmentos: Segmento[] = [];
  chars.forEach((c, i) => {
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.coincide === marcas[i]) ultimo.texto += c;
    else segmentos.push({ texto: c, coincide: marcas[i] });
  });
  return segmentos;
}

export interface ResultadoPersona { tipo: 'persona'; emp: Empleado; campo: 'nombre' | 'email' | 'puesto' | 'perfil' }
export interface ResultadoArea { tipo: 'area'; area: Area; personas: number }
export type ResultadoBusqueda = ResultadoPersona | ResultadoArea;

/** Personas (por nombre, correo, cargo o perfil) y áreas que coinciden. Primero las que empiezan con la consulta. */
export function buscar(consulta: string, empleados: Empleado[], areas: Area[], max = { personas: 6, areas: 5 }) {
  const q = normalizarTexto(consulta);
  if (q.length < 2) return { personas: [] as ResultadoPersona[], areas: [] as ResultadoArea[], totalPersonas: 0, totalAreas: 0 };
  const puntaje = (t: string | null | undefined) => {
    const n = normalizarTexto(t);
    if (!n.includes(q)) return -1;
    return n.startsWith(q) ? 0 : n.split(/\s+/).some(p => p.startsWith(q)) ? 1 : 2;
  };
  const personas = empleados.map(emp => {
    const campos: [ResultadoPersona['campo'], number][] = [
      ['nombre', puntaje(emp.nombre)], ['email', puntaje(emp.email)], ['puesto', puntaje(emp.puesto)], ['perfil', puntaje(emp.tipo_perfil)],
    ];
    const mejor = campos.filter(([, p]) => p >= 0).sort((a, b) => a[1] - b[1])[0];
    return mejor ? { r: { tipo: 'persona' as const, emp, campo: mejor[0] }, p: mejor[1] + (mejor[0] === 'nombre' ? 0 : 3) } : null;
  }).filter((x): x is { r: ResultadoPersona; p: number } => !!x)
    .sort((a, b) => a.p - b.p || a.r.emp.nombre.localeCompare(b.r.emp.nombre, 'es'));
  const enAreas = areas.map(area => ({ area, p: puntaje(area.nombre) })).filter(x => x.p >= 0)
    .sort((a, b) => a.p - b.p || a.area.nombre.localeCompare(b.area.nombre, 'es'));
  return {
    personas: personas.slice(0, max.personas).map(x => x.r),
    areas: enAreas.slice(0, max.areas).map(x => ({ tipo: 'area' as const, area: x.area, personas: empleados.filter(e => e.area_id === x.area.id).length })),
    totalPersonas: personas.length,
    totalAreas: enAreas.length,
  };
}

/** Ids de las áreas superiores de un área (de la más cercana a la raíz). */
export function ancestrosDe(areaId: number, areas: Area[]): number[] {
  const ids: number[] = [];
  const vistos = new Set<number>();
  let actual = areas.find(a => a.id === areaId)?.parent_id ?? null;
  while (actual !== null && !vistos.has(actual)) { ids.push(actual); vistos.add(actual); actual = areas.find(a => a.id === actual)?.parent_id ?? null; }
  return ids;
}
