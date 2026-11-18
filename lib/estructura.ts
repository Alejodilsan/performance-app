// Carga inicial completa: hojas Áreas → Cargos → Colaboradores en un solo libro. Funciones puras: corren en el
// navegador (vista previa) y otra vez en /api/importacion antes de escribir.
//
// Riesgo principal que se mitiga: duplicados. Dos nombres son EL MISMO si coinciden sin mayúsculas, tildes ni
// espacios sobrantes (normalizarNombre, igual que el índice único de la BD). Si solo se PARECEN ("Analista Sr" /
// "Analista Senior", "Logistica." / "Logística"), el Admin decide en la revisión si unificarlos o crear uno nuevo;
// no se aplica nada mientras haya parecidos sin decidir.
import { MONEDAS, type Area, type Empleado, type NivelCargo, type Periodicidad, type Puesto, type RangoSalarialCargo } from './tipos'
import {
  analizarImportacion, type AccionFila, type Cambio, type DefColumna, type FilaArchivo, type OpcionesImportacion, type ResultadoAnalisis,
} from './importacion'
import { parsearMonto, emailNormalizado } from './colaboradores'
import { buscarParecidos, limpiarNombre, normalizarNombre } from './similitud'
import { estaDentroDe } from './cargos'

export type Hoja = 'areas' | 'cargos' | 'colaboradores';
export const NOMBRE_HOJA: Record<Hoja, string> = { areas: 'Áreas', cargos: 'Cargos', colaboradores: 'Colaboradores' };

export type ClaveArea = 'nombre' | 'depende_de' | 'lider_email';
export type ClaveCargo = 'nombre' | 'area' | 'nivel' | 'descripcion' | 'salario_min' | 'salario_max' | 'moneda';

export const COLUMNAS_AREAS: DefColumna<ClaveArea>[] = [
  { clave: 'nombre', encabezado: 'Área', sinonimos: ['nombre', 'nombre del area', 'nombre area', 'departamento', 'gerencia'], obligatoria: 'siempre', ayuda: 'Nombre del área. Si ya existe (sin importar mayúsculas, tildes o espacios) se actualiza; si no, se crea.', ejemplo: 'Logística' },
  { clave: 'depende_de', encabezado: 'Depende de', sinonimos: ['area superior', 'area padre', 'padre', 'depende', 'reporta a', 'pertenece a'], ayuda: 'Área superior: otra fila de esta hoja o un área que ya exista. Vacío = área principal si es nueva (o sin cambio si ya existe). Escribe "Área principal" para sacarla de su área superior.', ejemplo: 'Operaciones' },
  { clave: 'lider_email', encabezado: 'Email líder', sinonimos: ['lider', 'email del lider', 'correo lider', 'correo del lider', 'responsable', 'jefe del area'], ayuda: 'Correo del líder del área: alguien activo o que venga en la hoja Colaboradores. Vacío = no cambia.', ejemplo: 'carlos.lopez@empresa.com' },
];

export const COLUMNAS_CARGOS: DefColumna<ClaveCargo>[] = [
  { clave: 'nombre', encabezado: 'Cargo', sinonimos: ['nombre', 'nombre del cargo', 'puesto', 'puesto de trabajo'], obligatoria: 'siempre', ayuda: 'Nombre del cargo. Puede repetirse en áreas distintas (son cargos distintos).', ejemplo: 'Analista de inventarios' },
  { clave: 'area', encabezado: 'Área', sinonimos: ['area del cargo', 'departamento', 'gerencia', 'dependencia'], obligatoria: 'siempre', ayuda: 'Área a la que pertenece: una fila de la hoja Áreas o un área existente.', ejemplo: 'Logística' },
  { clave: 'nivel', encabezado: 'Nivel', sinonimos: ['banda', 'nivel del cargo', 'categoria', 'grado', 'nivel jerarquico'], ayuda: 'Nivel o banda (Operativo, Profesional, Jefatura…). Los que no existan se crean en el catálogo de la empresa.', ejemplo: 'Profesional' },
  { clave: 'descripcion', encabezado: 'Descripción', sinonimos: ['funciones', 'descripcion del cargo', 'objetivo del cargo', 'responsabilidades', 'mision'], ayuda: 'Propósito y funciones principales.', ejemplo: 'Controla entradas y salidas del inventario.' },
  { clave: 'salario_min', encabezado: 'Salario mínimo', sinonimos: ['rango minimo', 'minimo', 'salario min', 'rango salarial minimo'], ayuda: 'Inicio del rango salarial del cargo (solo lo ve el Admin).', ejemplo: '2800000' },
  { clave: 'salario_max', encabezado: 'Salario máximo', sinonimos: ['rango maximo', 'maximo', 'salario max', 'rango salarial maximo'], ayuda: 'Fin del rango salarial del cargo.', ejemplo: '3600000' },
  { clave: 'moneda', encabezado: 'Moneda rango', sinonimos: ['moneda', 'divisa', 'moneda del rango'], ayuda: `${MONEDAS.join(', ')}. Vacío = moneda principal.`, ejemplo: 'COP' },
];

const RAIZ = new Set(['area principal', '(area principal)', 'principal', 'ninguna', 'ninguno', 'raiz', '-', 'n/a', 'na']);

// ------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------

export interface FilaHoja<K extends string> { numero: number; valores: Partial<Record<K, string>> }

export interface LibroCarga {
  areas: FilaHoja<ClaveArea>[];
  cargos: FilaHoja<ClaveCargo>[];
  colaboradores: FilaArchivo[];
}

export interface ContextoCarga {
  activos: Empleado[];
  desvinculados: Empleado[];
  areas: Area[];
  puestos: Puesto[];
  niveles: NivelCargo[];
  /** Rangos salariales vigentes por cargo (solo se envían al Admin) */
  rangos: Map<number, RangoSalarialCargo>;
  salariosVigentes: Map<number, { salario: number; moneda: string; periodicidad: Periodicidad }>;
  emailImportador: string;
  monedaPorDefecto: string;
}

export type TipoNombre = 'area' | 'cargo' | 'nivel';

/** Decisión del Admin por cada nombre parecido: nombre al que se unifica, o '' = "es distinto, crear nuevo". */
export type Decisiones = Record<string, string>;

export interface Parecido {
  id: string;
  tipo: TipoNombre;
  /** Nombre tal como viene en el archivo */
  nombre: string;
  /** Para cargos: área en la que se compara */
  ambito?: string;
  usos: Partial<Record<Hoja, number[]>>;
  candidatos: { nombre: string; origen: 'existente' | 'archivo'; puntaje: number }[];
  /** Decisión vigente (si es válida) */
  decision?: string;
}

export interface FilaEstructura {
  hoja: 'areas' | 'cargos';
  numero: number;
  /** Identifica la fila entre análisis (confirmación): nombre normalizado (áreas) o "área|cargo" (cargos) */
  clave: string;
  nombre: string;
  accion: AccionFila;
  errores: string[];
  advertencias: string[];
  cambios: Cambio[];
  // Áreas
  /** undefined = no cambia; null = área principal */
  padreNombre?: string | null;
  liderEmail?: string;
  // Cargos
  areaNombre?: string;
  nivelNombre?: string;
  descripcion?: string;
  rango?: { min: number | null; max: number | null; moneda: string };
}

export interface ResultadoCarga {
  areas: FilaEstructura[];
  cargos: FilaEstructura[];
  colaboradores: ResultadoAnalisis;
  /** Niveles que se crearán (los usa alguna fila válida de Cargos) */
  nivelesNuevos: string[];
  parecidos: Parecido[];
  /** Parecidos sin decisión: mientras sea > 0 no se puede aplicar */
  pendientes: number;
}

export const filaValida = (f: { accion: AccionFila }) => f.accion === 'crear' || f.accion === 'actualizar';

// ------------------------------------------------------------------
// Análisis
// ------------------------------------------------------------------

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const idNombre = (tipo: TipoNombre, nombre: string, ambito = '') =>
  tipo === 'cargo' ? `cargo:${ambito}|${normalizarNombre(nombre)}` : `${tipo}:${normalizarNombre(nombre)}`;

export function analizarCarga(libro: LibroCarga, ctx: ContextoCarga, op: OpcionesImportacion, decisiones: Decisiones): ResultadoCarga {
  const val = <K extends string>(f: FilaHoja<K>, c: K) => limpiarNombre(f.valores[c] ?? '');
  const nombreAreaPorId = new Map(ctx.areas.map(a => [a.id, a.nombre]));
  const emailPorId = new Map(ctx.activos.map(e => [e.id, emailNormalizado(e.email)]));
  const activoPorEmail = new Map(ctx.activos.filter(e => emailNormalizado(e.email)).map(e => [emailNormalizado(e.email), e]));
  const desvPorEmail = new Map(ctx.desvinculados.filter(e => emailNormalizado(e.email)).map(e => [emailNormalizado(e.email), e]));

  // ---------- 0. Nombres nuevos y sus parecidos (independiente de las decisiones de cargos) ----------
  const registro = new Map<string, Parecido>();
  const nuevosPorAmbito = new Map<string, string[]>();
  const existentes = (tipo: TipoNombre, ambito: string): string[] => {
    if (tipo === 'area') return ctx.areas.map(a => a.nombre);
    if (tipo === 'nivel') return ctx.niveles.map(n => n.nombre);
    // Cargos del área (o de sus áreas superiores) y los antiguos sin área
    const area = ctx.areas.find(a => normalizarNombre(a.nombre) === ambito);
    return ctx.puestos.filter(p => p.area_id == null || (area && estaDentroDe(area.id, p.area_id, ctx.areas))).map(p => p.nombre);
  };
  function registrar(tipo: TipoNombre, crudo: string, hoja: Hoja, numero: number, existe: boolean, ambito = '', ambitoNombre?: string) {
    const nombre = limpiarNombre(crudo);
    if (!nombre || existe) return;
    const id = idNombre(tipo, nombre, ambito);
    let r = registro.get(id);
    if (!r) {
      const claveAmbito = `${tipo}|${ambito}`;
      const previos = nuevosPorAmbito.get(claveAmbito) || [];
      const candidatos = buscarParecidos(nombre, [
        ...existentes(tipo, ambito).map(n => ({ valor: 'existente' as const, nombre: n })),
        ...previos.map(n => ({ valor: 'archivo' as const, nombre: n })),
      ]);
      r = { id, tipo, nombre, ambito: ambitoNombre, usos: {}, candidatos: candidatos.map(c => ({ nombre: c.nombre, origen: c.valor, puntaje: c.puntaje })) };
      registro.set(id, r);
      nuevosPorAmbito.set(claveAmbito, [...previos, nombre]);
    }
    r.usos[hoja] = [...(r.usos[hoja] || []), numero];
  }

  /** Aplica las decisiones del Admin (solo si apuntan a uno de los candidatos sugeridos). */
  function homologar(tipo: TipoNombre, crudo: string, ambito = ''): string {
    let nombre = limpiarNombre(crudo);
    for (let i = 0; i < 5; i++) {
      const r = registro.get(idNombre(tipo, nombre, ambito));
      const destino = r ? decisiones[r.id] : undefined;
      if (!r || !destino) break;
      const candidato = r.candidatos.find(c => normalizarNombre(c.nombre) === normalizarNombre(destino));
      if (!candidato) break;
      nombre = candidato.nombre;
    }
    return nombre;
  }

  // Áreas: primero las de la hoja Áreas, luego las referencias de las otras hojas
  const nombresAreaExistentes = new Set(ctx.areas.map(a => normalizarNombre(a.nombre)));
  const nombresAreaHoja = new Set(libro.areas.map(f => normalizarNombre(val(f, 'nombre'))).filter(Boolean));
  const areaConocida = (n: string) => nombresAreaExistentes.has(normalizarNombre(n)) || nombresAreaHoja.has(normalizarNombre(n));
  libro.areas.forEach(f => registrar('area', val(f, 'nombre'), 'areas', f.numero, nombresAreaExistentes.has(normalizarNombre(val(f, 'nombre')))));
  libro.areas.forEach(f => { const p = val(f, 'depende_de'); if (p && !RAIZ.has(normalizarNombre(p))) registrar('area', p, 'areas', f.numero, areaConocida(p)); });
  libro.cargos.forEach(f => registrar('area', val(f, 'area'), 'cargos', f.numero, areaConocida(val(f, 'area'))));
  libro.colaboradores.forEach(f => { const a = limpiarNombre(f.valores.area); if (a) registrar('area', a, 'colaboradores', f.numero, areaConocida(a)); });

  // Niveles
  const nombresNivel = new Set(ctx.niveles.map(n => normalizarNombre(n.nombre)));
  libro.cargos.forEach(f => registrar('nivel', val(f, 'nivel'), 'cargos', f.numero, nombresNivel.has(normalizarNombre(val(f, 'nivel')))));

  // Cargos: se comparan dentro de su área (ya unificada)
  const ambitoArea = (crudo: string) => normalizarNombre(homologar('area', crudo));
  const cargoExisteEnAmbito = (nombre: string, ambito: string) => {
    const area = ctx.areas.find(a => normalizarNombre(a.nombre) === ambito);
    // Mismo nombre en esa área, o uno antiguo sin área (la fila lo completa con su área)
    return ctx.puestos.some(p => normalizarNombre(p.nombre) === normalizarNombre(nombre) && (p.area_id == null || p.area_id === area?.id));
  };
  const nombresCargoHoja = new Set(libro.cargos.map(f => normalizarNombre(val(f, 'nombre'))));
  const nombresCargoExistentes = new Set(ctx.puestos.map(p => normalizarNombre(p.nombre)));
  libro.cargos.forEach(f => {
    const amb = ambitoArea(val(f, 'area'));
    registrar('cargo', val(f, 'nombre'), 'cargos', f.numero, cargoExisteEnAmbito(val(f, 'nombre'), amb), amb, homologar('area', val(f, 'area')));
  });
  libro.colaboradores.forEach(f => {
    const cargo = limpiarNombre(f.valores.puesto);
    if (!cargo) return;
    const areaFila = limpiarNombre(f.valores.area);
    const existente = activoPorEmail.get((f.valores.email || '').trim().toLowerCase());
    const areaNombre = areaFila ? homologar('area', areaFila) : (existente?.area_id ? nombreAreaPorId.get(existente.area_id) || '' : '');
    // Desde Colaboradores basta con que el nombre exista en algún área: resolverCargo se encarga del área
    const existe = nombresCargoExistentes.has(normalizarNombre(cargo)) || nombresCargoHoja.has(normalizarNombre(cargo));
    registrar('cargo', cargo, 'colaboradores', f.numero, existe, normalizarNombre(areaNombre), areaNombre || 'sin área');
  });

  const parecidos = [...registro.values()].filter(r => r.candidatos.length > 0).map(r => {
    const d = decisiones[r.id];
    const valida = d === '' || (d !== undefined && r.candidatos.some(c => normalizarNombre(c.nombre) === normalizarNombre(d)));
    return valida ? { ...r, decision: d } : r;
  });

  // ---------- 1. Hoja Áreas ----------
  const areasFinal: Area[] = ctx.areas.map(a => ({ ...a }));
  const areaPorNombre = new Map(areasFinal.map(a => [normalizarNombre(a.nombre), a]));
  let idTemporal = -100000;
  const filasAreas: FilaEstructura[] = [];
  const filaDeArea = new Map<string, FilaEstructura>(); // nombre normalizado → fila que lo define
  const nuevaFila = (hoja: 'areas' | 'cargos', numero: number): FilaEstructura =>
    ({ hoja, numero, clave: '', nombre: '', accion: 'error', errores: [], advertencias: [], cambios: [] });
  const firmas = new Map<string, string>();

  for (const f of libro.areas) {
    const fila = nuevaFila('areas', f.numero);
    filasAreas.push(fila);
    const crudo = val(f, 'nombre');
    if (!crudo) { fila.errores.push('Falta el nombre del área.'); continue; }
    fila.nombre = homologar('area', crudo);
    fila.clave = normalizarNombre(fila.nombre);
    const padreCrudo = val(f, 'depende_de');
    const lider = (f.valores.lider_email || '').trim().toLowerCase();
    const firma = `${padreCrudo ? normalizarNombre(homologar('area', padreCrudo)) : ''}|${lider}`;
    const previa = filaDeArea.get(fila.clave);
    if (previa) {
      if (firmas.get(fila.clave) === firma) { fila.accion = 'sin_cambios'; fila.advertencias.push(`Repetida (fila ${previa.numero}): se ignora.`); }
      else fila.errores.push(`El área "${fila.nombre}" ya está en la fila ${previa.numero} con otros datos: deja solo una.`);
      continue;
    }
    filaDeArea.set(fila.clave, fila);
    firmas.set(fila.clave, firma);
    if (fila.nombre.length > 120) fila.errores.push('El nombre es demasiado largo (máx. 120 caracteres).');
    if (!areaPorNombre.has(fila.clave)) {
      const nueva: Area = { id: idTemporal--, nombre: fila.nombre, lider_id: null, parent_id: null };
      areasFinal.push(nueva);
      areaPorNombre.set(fila.clave, nueva);
    }
    if (lider) {
      if (!EMAIL_VALIDO.test(lider)) fila.errores.push(`"${lider}" no es un correo válido.`);
      else if (desvPorEmail.has(lider)) fila.errores.push(`El líder ${desvPorEmail.get(lider)!.nombre} está desvinculado.`);
      else if (!activoPorEmail.has(lider) && !libro.colaboradores.some(c => (c.valores.email || '').trim().toLowerCase() === lider)) {
        fila.errores.push(`El líder "${lider}" no existe ni viene en la hoja Colaboradores.`);
      } else fila.liderEmail = lider;
    }
  }

  // Áreas superiores (ya se conocen todos los nombres de la hoja)
  const original = new Map(ctx.areas.map(a => [a.id, a]));
  const libroPorFila = new Map(libro.areas.map(f => [f.numero, f]));
  for (const fila of filasAreas) {
    if (fila.accion !== 'error' || fila.errores.length > 0 || !fila.clave || filaDeArea.get(fila.clave) !== fila) continue;
    const padreCrudo = val(libroPorFila.get(fila.numero)!, 'depende_de');
    if (!padreCrudo) continue;
    if (RAIZ.has(normalizarNombre(padreCrudo))) { fila.padreNombre = null; continue; }
    const padre = areaPorNombre.get(normalizarNombre(homologar('area', padreCrudo)));
    if (!padre) fila.errores.push(`El área superior "${padreCrudo}" no existe: agrégala como otra fila de esta hoja.`);
    else if (normalizarNombre(padre.nombre) === fila.clave) fila.errores.push('Un área no puede depender de sí misma.');
    else fila.padreNombre = padre.nombre;
  }

  // Invalida filas con error (y en cascada las que dependen de ellas) y detecta ciclos
  const aplicarPadres = () => {
    areasFinal.forEach(a => { if (a.id > 0) a.parent_id = original.get(a.id)?.parent_id ?? null; else a.parent_id = null; });
    filasAreas.forEach(fila => {
      if (fila.errores.length > 0 || fila.padreNombre === undefined || filaDeArea.get(fila.clave) !== fila) return;
      const a = areaPorNombre.get(fila.clave);
      if (a) a.parent_id = fila.padreNombre === null ? null : areaPorNombre.get(normalizarNombre(fila.padreNombre))?.id ?? null;
    });
  };
  const quitarInvalidas = () => {
    filasAreas.forEach(fila => {
      if (fila.errores.length === 0 || !fila.clave || filaDeArea.get(fila.clave) !== fila) return;
      const a = areaPorNombre.get(fila.clave);
      if (a && a.id < 0) { areaPorNombre.delete(fila.clave); areasFinal.splice(areasFinal.indexOf(a), 1); }
    });
  };
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    quitarInvalidas();
    let cambio = false;
    filasAreas.forEach(fila => {
      if (fila.errores.length > 0 || !fila.padreNombre || filaDeArea.get(fila.clave) !== fila) return;
      if (!areaPorNombre.has(normalizarNombre(fila.padreNombre))) {
        fila.errores.push(`Su área superior "${fila.padreNombre}" tiene errores.`); cambio = true;
      }
    });
    aplicarPadres();
    // Ciclos con el árbol final (existentes + cambios de la hoja). Se marcan solo las filas que forman el ciclo
    // y, si alguna mueve un área que YA existía, solo esa (lo más probable es que ese sea el error).
    const padreDe = new Map(areasFinal.map(a => [a.id, a.parent_id]));
    const enCiclo = filasAreas.filter(fila => {
      if (fila.errores.length > 0 || fila.padreNombre == null || filaDeArea.get(fila.clave) !== fila) return false;
      const inicio = areaPorNombre.get(fila.clave)!.id;
      const vistos = new Set<number>();
      let actual = padreDe.get(inicio);
      while (actual != null && !vistos.has(actual)) {
        if (actual === inicio) return true;
        vistos.add(actual);
        actual = padreDe.get(actual);
      }
      return false;
    });
    const mueveExistente = enCiclo.filter(f => (areaPorNombre.get(f.clave)?.id ?? 0) > 0);
    (mueveExistente.length > 0 ? mueveExistente : enCiclo).forEach(fila => {
      fila.errores.push(`Con "Depende de: ${fila.padreNombre}" se forma un ciclo (un área terminaría dependiendo de sí misma).`);
      cambio = true;
    });
    if (!cambio) break;
  }

  // ---------- 2. Niveles ----------
  const nivelPorNombre = new Map(ctx.niveles.map(n => [normalizarNombre(n.nombre), n.nombre]));
  const nivelesNuevos = new Map<string, string>();
  const resolverNivel = (crudo: string) => {
    const nombre = homologar('nivel', crudo);
    const n = normalizarNombre(nombre);
    if (nivelPorNombre.has(n)) return nivelPorNombre.get(n)!;
    if (!nivelesNuevos.has(n)) nivelesNuevos.set(n, nombre);
    return nivelesNuevos.get(n)!;
  };
  const nombreNivel = (id?: number | null) => ctx.niveles.find(n => n.id === id)?.nombre ?? '';

  // ---------- 3. Hoja Cargos ----------
  const puestosFinal: Puesto[] = ctx.puestos.map(p => ({ ...p }));
  const reclamados = new Set<number>();
  const filasCargos: FilaEstructura[] = [];
  const filaDeCargo = new Map<string, FilaEstructura>();
  const firmasCargo = new Map<string, string>();
  const fmt = (v: number | null, m: string) => (v === null ? '—' : `${v.toLocaleString('es-CO')} ${m}`);

  for (const f of libro.cargos) {
    const fila = nuevaFila('cargos', f.numero);
    filasCargos.push(fila);
    const err = (m: string) => fila.errores.push(m);
    const nombreCrudo = val(f, 'nombre'), areaCrudo = val(f, 'area');
    if (!nombreCrudo) err('Falta el nombre del cargo.');
    if (!areaCrudo) err('Falta el área del cargo (es obligatoria).');
    if (!nombreCrudo || !areaCrudo) { fila.nombre = nombreCrudo; continue; }
    const area = areaPorNombre.get(normalizarNombre(homologar('area', areaCrudo)));
    fila.nombre = nombreCrudo;
    if (!area) { err(`El área "${areaCrudo}" no existe${nombresAreaHoja.has(normalizarNombre(areaCrudo)) ? ' (tiene errores en la hoja Áreas)' : ': agrégala a la hoja Áreas'}.`); continue; }
    const ambito = normalizarNombre(area.nombre);
    fila.nombre = homologar('cargo', nombreCrudo, ambito);
    fila.areaNombre = area.nombre;
    fila.clave = `${ambito}|${normalizarNombre(fila.nombre)}`;
    if (fila.nombre.length > 120) err('El nombre es demasiado largo (máx. 120 caracteres).');

    const firma = ['nivel', 'descripcion', 'salario_min', 'salario_max', 'moneda'].map(c => normalizarNombre(f.valores[c as ClaveCargo])).join('|');
    const previa = filaDeCargo.get(fila.clave);
    if (previa) {
      if (firmasCargo.get(fila.clave) === firma) { fila.accion = 'sin_cambios'; fila.advertencias.push(`Repetido (fila ${previa.numero}): se ignora.`); }
      else err(`El cargo "${fila.nombre}" de "${area.nombre}" ya está en la fila ${previa.numero} con otros datos: deja solo una.`);
      continue;
    }
    filaDeCargo.set(fila.clave, fila);
    firmasCargo.set(fila.clave, firma);

    // ¿Existe? Primero en la misma área; si no, un cargo antiguo sin área con ese nombre se completa con esta área
    let existente = area.id > 0 ? puestosFinal.find(p => p.id > 0 && p.area_id === area.id && normalizarNombre(p.nombre) === normalizarNombre(fila.nombre)) : undefined;
    let completaArea = false;
    if (!existente) {
      existente = puestosFinal.find(p => p.id > 0 && p.area_id == null && !reclamados.has(p.id) && normalizarNombre(p.nombre) === normalizarNombre(fila.nombre));
      completaArea = !!existente;
    }
    if (completaArea) fila.cambios.push({ campo: 'Área', antes: 'sin área', despues: area.nombre });
    if (!existente && ctx.puestos.some(p => p.area_id != null && p.area_id !== area.id && normalizarNombre(p.nombre) === normalizarNombre(fila.nombre))) {
      fila.advertencias.push(`Ya existe "${fila.nombre}" en otra área; este será un cargo distinto de "${area.nombre}".`);
    }

    // Nivel
    if (val(f, 'nivel')) {
      fila.nivelNombre = resolverNivel(val(f, 'nivel'));
      const antes = nombreNivel(existente?.nivel_id);
      if (existente && normalizarNombre(antes) !== normalizarNombre(fila.nivelNombre)) fila.cambios.push({ campo: 'Nivel', antes: antes || '—', despues: fila.nivelNombre });
    }
    // Descripción
    const desc = (f.valores.descripcion || '').trim();
    if (desc) {
      if (desc.length > 4000) err('La descripción es demasiado larga (máx. 4.000 caracteres).');
      fila.descripcion = desc;
      if (existente && (existente.descripcion || '').trim() !== desc) fila.cambios.push({ campo: 'Descripción', antes: existente.descripcion ? 'anterior' : '—', despues: desc.length > 40 ? desc.slice(0, 40) + '…' : desc });
    }
    // Rango salarial
    const minT = val(f, 'salario_min'), maxT = val(f, 'salario_max');
    if (minT || maxT) {
      const actual = existente ? ctx.rangos.get(existente.id) : undefined;
      const moneda = (val(f, 'moneda') || actual?.moneda || ctx.monedaPorDefecto).toUpperCase();
      const min = minT ? parsearMonto(minT) : (actual?.salario_min ?? null);
      const max = maxT ? parsearMonto(maxT) : (actual?.salario_max ?? null);
      if (minT && (min === null || min <= 0)) err(`Salario mínimo "${minT}" no válido.`);
      else if (maxT && (max === null || max <= 0)) err(`Salario máximo "${maxT}" no válido.`);
      else if (!(MONEDAS as readonly string[]).includes(moneda)) err(`Moneda "${moneda}" no válida (${MONEDAS.join(', ')}).`);
      else if (min !== null && max !== null && min > max) err('El salario mínimo es mayor que el máximo.');
      else {
        fila.rango = { min, max, moneda };
        const igual = actual && actual.salario_min === min && actual.salario_max === max && actual.moneda === moneda;
        if (existente && !igual) fila.cambios.push({ campo: 'Rango salarial', antes: actual ? `${fmt(actual.salario_min, actual.moneda)} – ${fmt(actual.salario_max, actual.moneda)}` : '—', despues: `${fmt(min, moneda)} – ${fmt(max, moneda)}` });
      }
    } else if (val(f, 'moneda')) fila.advertencias.push('Moneda sin salario mínimo ni máximo: se ignora.');

    if (fila.errores.length > 0) continue;
    if (existente) {
      if (completaArea) { reclamados.add(existente.id); existente.area_id = area.id; }
      fila.accion = fila.cambios.length > 0 ? 'actualizar' : 'sin_cambios';
    } else {
      puestosFinal.push({ id: idTemporal--, nombre: fila.nombre, area_id: area.id, descripcion: fila.descripcion ?? null });
      fila.accion = 'crear';
    }
  }

  // ---------- 4. Hoja Colaboradores (con las áreas y cargos que quedarán) ----------
  const lideresAsignados = new Map<string, string>();
  filasAreas.forEach(fila => {
    if (fila.errores.length === 0 && fila.liderEmail && filaDeArea.get(fila.clave) === fila) {
      const a = areaPorNombre.get(fila.clave);
      if (a) lideresAsignados.set(String(a.id), fila.liderEmail);
    }
  });
  const colaboradores = analizarImportacion(libro.colaboradores, {
    activos: ctx.activos, desvinculados: ctx.desvinculados, areas: areasFinal, puestos: puestosFinal,
    salariosVigentes: ctx.salariosVigentes, emailImportador: ctx.emailImportador, monedaPorDefecto: ctx.monedaPorDefecto,
    homologar: (tipo, nombre, ambito) => homologar(tipo, nombre, ambito), lideresAsignados,
  }, op);

  // ---------- 5. Cierre de la hoja Áreas: líderes y acción ----------
  const filaColab = new Map(colaboradores.filas.map(f => [f.email, f]));
  for (const fila of filasAreas) {
    if (fila.accion === 'sin_cambios' && fila.errores.length === 0) continue; // repetida
    if (fila.errores.length > 0) { fila.accion = 'error'; continue; }
    const area = areaPorNombre.get(fila.clave)!;
    const existente = area.id > 0 ? original.get(area.id) : undefined;
    if (fila.liderEmail) {
      const fc = filaColab.get(fila.liderEmail);
      if (!activoPorEmail.has(fila.liderEmail) && fc?.accion === 'error') {
        fila.errores.push(`El líder ${fila.liderEmail} tiene errores en la hoja Colaboradores.`); fila.accion = 'error'; continue;
      }
      const tipo = fc?.datos?.tipo_perfil ?? activoPorEmail.get(fila.liderEmail)?.tipo_perfil ?? 'Empleado';
      if (!['Líder de Área', 'Manager', 'Admin'].includes(tipo)) fila.advertencias.push(`${fc?.datos?.nombre || activoPorEmail.get(fila.liderEmail)?.nombre || fila.liderEmail} liderará el área pero su tipo de perfil es "${tipo}" (considera "Líder de Área").`);
      const antes = existente?.lider_id ? emailPorId.get(existente.lider_id) : undefined;
      if (existente && antes !== fila.liderEmail) fila.cambios.push({ campo: 'Líder', antes: antes || '—', despues: fila.liderEmail });
    }
    if (existente && fila.padreNombre !== undefined) {
      const antes = existente.parent_id ? nombreAreaPorId.get(existente.parent_id) ?? '' : '';
      const despues = fila.padreNombre ?? '';
      if (normalizarNombre(antes) !== normalizarNombre(despues)) fila.cambios.push({ campo: 'Depende de', antes: antes || 'Área principal', despues: despues || 'Área principal' });
    }
    if (!existente) fila.accion = 'crear';
    else fila.accion = fila.cambios.length > 0 ? 'actualizar' : 'sin_cambios';
  }

  // Solo se crean niveles que usa alguna fila válida de Cargos
  const nivelesUsados = new Set(filasCargos.filter(filaValida).map(f => normalizarNombre(f.nivelNombre)));
  return {
    areas: filasAreas,
    cargos: filasCargos,
    colaboradores,
    nivelesNuevos: [...nivelesNuevos.entries()].filter(([k]) => nivelesUsados.has(k)).map(([, n]) => n),
    parecidos,
    pendientes: parecidos.filter(p => p.decision === undefined).length,
  };
}

/** Resumen por acción de una lista de filas. */
export function resumenAcciones(filas: { accion: AccionFila }[]): Record<AccionFila, number> {
  const r: Record<AccionFila, number> = { crear: 0, actualizar: 0, sin_cambios: 0, error: 0 };
  filas.forEach(f => { r[f.accion]++; });
  return r;
}
