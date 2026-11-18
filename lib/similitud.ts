// Detección de nombres duplicados o parecidos (áreas, cargos, niveles). Funciones puras.
import { normalizarTexto } from './jerarquia'

/**
 * Clave para decidir si dos nombres son EL MISMO: minúsculas, sin tildes, sin espacios sobrantes.
 * Debe coincidir con public.normalizar_nombre() (migración 20261119), que respalda el índice único en BD.
 */
export const normalizarNombre = (texto: string | null | undefined) => normalizarTexto(texto).replace(/\s+/g, ' ');

/** Limpia el nombre que escribe el usuario: sin espacios sobrantes (conserva mayúsculas y tildes). */
export const limpiarNombre = (texto: string | null | undefined) => (texto || '').trim().replace(/\s+/g, ' ');

// Abreviaturas frecuentes en nombres de cargos y áreas
const ABREVIATURAS: Record<string, string> = {
  sr: 'senior', ssr: 'semisenior', jr: 'junior', aux: 'auxiliar', asist: 'asistente', asis: 'asistente',
  coord: 'coordinador', coordinadora: 'coordinador', ger: 'gerente', gte: 'gerente', gerenta: 'gerente', dir: 'director', directora: 'director',
  jef: 'jefe', jefa: 'jefe', esp: 'especialista', tec: 'tecnico', tecnica: 'tecnico', ing: 'ingeniero', ingeniera: 'ingeniero',
  adm: 'administrativo', admin: 'administrativo', administrativa: 'administrativo', analist: 'analista', op: 'operario', oper: 'operario',
  operaria: 'operario', vend: 'vendedor', vendedora: 'vendedor', contador: 'contador', contadora: 'contador',
  rrhh: 'recursos humanos', rh: 'recursos humanos', ti: 'tecnologia', it: 'tecnologia', sst: 'seguridad salud trabajo',
  dpto: 'departamento', depto: 'departamento', dep: 'departamento', gcia: 'gerencia', vp: 'vicepresidencia',
  i: '1', ii: '2', iii: '3', iv: '4', uno: '1', dos: '2', tres: '3',
};
const DISTINTIVOS = new Set([
  'junior', 'senior', 'semisenior', 'trainee', 'practicante', 'aprendiz', 'auxiliar', 'asistente', 'analista', 'especialista',
  'profesional', 'tecnico', 'coordinador', 'supervisor', 'jefe', 'lider', 'gerente', 'subgerente', 'director', 'subdirector',
  'presidente', 'vicepresidente', 'nacional', 'regional', 'local', 'norte', 'sur', 'oriente', 'occidente', 'centro',
]);
const PALABRAS_VACIAS =new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'a', 'al']);

/** Lleva una palabra a una forma comparable: abreviatura expandida y sin plural simple. */
function raiz(palabra: string): string {
  const p = ABREVIATURAS[palabra] ?? palabra;
  if (p.includes(' ')) return p;
  if (p.length > 4 && p.endsWith('es') && !p.endsWith('ces')) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}

/** Forma comparable de un nombre: sin signos, abreviaturas expandidas, sin palabras vacías ni plurales. */
export function claveSimilitud(nombre: string): string {
  const palabras = normalizarNombre(nombre).replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter(Boolean);
  return palabras.map(raiz).join(' ').split(' ').filter(p => p && !PALABRAS_VACIAS.has(p)).join(' ');
}

/** Iniciales de las palabras con contenido: "Tecnología de la Información" → "ti". */
function iniciales(nombre: string): string {
  return normalizarNombre(nombre).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(p => p && !PALABRAS_VACIAS.has(p)).map(p => p[0]).join('');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length];
}

/** 0 a 1: qué tan probable es que dos nombres distintos se refieran a lo mismo. */
export function puntajeSimilitud(a: string, b: string): number {
  if (normalizarNombre(a) === normalizarNombre(b)) return 1;
  const ka = claveSimilitud(a), kb = claveSimilitud(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 0.97;
  // Distintos a propósito: difieren en una palabra que marca nivel ("Analista Junior" / "Analista Senior", "I" / "II")
  const ta = ka.split(' '), tb = kb.split(' ');
  const soloA = ta.filter(p => !tb.includes(p)), soloB = tb.filter(p => !ta.includes(p));
  const distintivo = (p: string) => DISTINTIVOS.has(p) || /^\d+$/.test(p);
  if (soloA.some(distintivo) && soloB.some(distintivo)) return 0;
  // Mismas palabras en otro orden ("Gerente Comercial" / "Comercial Gerente")
  const ordenadas = (k: string) => k.split(' ').sort().join(' ');
  if (ordenadas(ka) === ordenadas(kb)) return 0.93;
  // Siglas ("TI" / "Tecnología de la Información")
  const sa = normalizarNombre(a).replace(/[^a-z0-9]/g, ''), sb = normalizarNombre(b).replace(/[^a-z0-9]/g, '');
  if ((sa.length >= 2 && sa.length <= 5 && sa === iniciales(b)) || (sb.length >= 2 && sb.length <= 5 && sb === iniciales(a))) return 0.88;
  // Errores de tipeo: distancia de edición relativa ("Analista" / "Analista Contable" NO se consideran parecidos)
  return 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
}

export const UMBRAL_PARECIDO = 0.8;

export interface Candidato<T> { valor: T; nombre: string; puntaje: number }

/** Candidatos parecidos (no idénticos) a un nombre, del más al menos parecido. */
export function buscarParecidos<T>(nombre: string, candidatos: { valor: T; nombre: string }[], max = 3): Candidato<T>[] {
  const propio = normalizarNombre(nombre);
  return candidatos
    .filter(c => normalizarNombre(c.nombre) !== propio)
    .map(c => ({ ...c, puntaje: puntajeSimilitud(nombre, c.nombre) }))
    .filter(c => c.puntaje >= UMBRAL_PARECIDO)
    .sort((x, y) => y.puntaje - x.puntaje)
    .slice(0, max);
}
