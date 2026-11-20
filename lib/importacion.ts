// Importación masiva de colaboradores (crear y actualizar). Funciones puras: las usa el navegador para la
// vista previa y el servidor (/api/importacion) para volver a validar antes de escribir.
import {
  TIPOS_DOCUMENTO, TIPOS_CONTRATO, MODALIDADES, JORNADAS, PERIODICIDADES, MONEDAS,
  type Area, type Empleado, type Puesto, type TipoPerfil, type Periodicidad,
} from './tipos'
import {
  datosDesdeEmpleado, datosVacios, emailNormalizado, validarColaborador, parsearMonto, hoyISO,
  type DatosColaborador, type DatosCompensacion,
} from './colaboradores'
import { normalizarTexto } from './jerarquia'
import { normalizarNombre, limpiarNombre } from './similitud'
import { resolverCargo, etiquetaCargo } from './cargos'

export const MAX_FILAS = 1000;
const ROLES: TipoPerfil[] = ['Admin', 'Manager', 'Líder de Área', 'Empleado', 'Auditor'];

// ------------------------------------------------------------------
// Columnas de la plantilla
// ------------------------------------------------------------------

export type ClaveColumna =
  | 'nombre' | 'email' | 'puesto' | 'tipo_perfil' | 'area' | 'jefe_email' | 'fecha_ingreso'
  | 'tipo_documento' | 'numero_documento' | 'fecha_nacimiento' | 'telefono' | 'email_personal'
  | 'sede' | 'centro_costo' | 'tipo_contrato' | 'modalidad' | 'jornada'
  | 'salario' | 'moneda' | 'periodicidad' | 'salario_desde' | 'motivo_salario' | 'potencial';

export interface DefColumna<K extends string = ClaveColumna> {
  clave: K;
  encabezado: string;
  sinonimos: string[];
  /** 'siempre' = obligatoria en toda fila; 'crear' = obligatoria solo para colaboradores nuevos */
  obligatoria?: 'siempre' | 'crear';
  ayuda: string;
  ejemplo: string;
  tipo?: 'fecha';
}

export const COLUMNAS: DefColumna[] = [
  { clave: 'nombre', encabezado: 'Nombre', sinonimos: ['nombre completo', 'colaborador', 'empleado', 'nombres'], obligatoria: 'crear', ayuda: 'Nombre completo.', ejemplo: 'Ana María Ruiz' },
  { clave: 'email', encabezado: 'Email', sinonimos: ['correo', 'correo corporativo', 'email corporativo', 'e-mail', 'mail', 'usuario'], obligatoria: 'siempre', ayuda: 'Correo corporativo. Identifica a la persona: si ya existe se ACTUALIZA, si no se CREA.', ejemplo: 'ana.ruiz@empresa.com' },
  { clave: 'puesto', encabezado: 'Cargo', sinonimos: ['puesto', 'puesto de trabajo', 'nombre del cargo', 'rol'], obligatoria: 'crear', ayuda: 'Debe existir en la hoja Cargos o en el catálogo, preferiblemente en la misma área del colaborador.', ejemplo: 'Analista' },
  { clave: 'tipo_perfil', encabezado: 'Tipo de perfil', sinonimos: ['perfil', 'tipo perfil', 'permisos', 'rol de acceso'], obligatoria: 'crear', ayuda: `Define sus permisos: ${ROLES.join(', ')}.`, ejemplo: 'Empleado' },
  { clave: 'area', encabezado: 'Área', sinonimos: ['area', 'departamento', 'gerencia'], ayuda: 'Debe existir en la hoja Áreas o en la plataforma. Obligatoria para Líder de Área.', ejemplo: 'Operaciones' },
  { clave: 'jefe_email', encabezado: 'Email jefe directo', sinonimos: ['jefe directo', 'jefe', 'correo jefe', 'email jefe', 'reporta a', 'lider'], ayuda: 'Correo del jefe directo (puede ser alguien del mismo archivo).', ejemplo: 'carlos.lopez@empresa.com' },
  { clave: 'fecha_ingreso', encabezado: 'Fecha de ingreso', sinonimos: ['ingreso', 'fecha ingreso', 'fecha de contratacion', 'fecha contratacion'], ayuda: 'AAAA-MM-DD o DD/MM/AAAA.', ejemplo: '2024-02-01', tipo: 'fecha' },
  { clave: 'tipo_documento', encabezado: 'Tipo de documento', sinonimos: ['tipo documento', 'tipo doc'], ayuda: TIPOS_DOCUMENTO.join(', ') + '.', ejemplo: 'Cédula de ciudadanía' },
  { clave: 'numero_documento', encabezado: 'Número de documento', sinonimos: ['documento', 'numero documento', 'cedula', 'identificacion', 'dni', 'rut', 'no documento'], ayuda: 'No puede repetirse en la empresa.', ejemplo: '1020304050' },
  { clave: 'fecha_nacimiento', encabezado: 'Fecha de nacimiento', sinonimos: ['nacimiento', 'fecha nacimiento', 'cumpleanos'], ayuda: 'AAAA-MM-DD o DD/MM/AAAA.', ejemplo: '1992-07-15', tipo: 'fecha' },
  { clave: 'telefono', encabezado: 'Teléfono', sinonimos: ['telefono', 'celular', 'movil', 'tel'], ayuda: 'Con indicativo si aplica.', ejemplo: '+57 300 123 4567' },
  { clave: 'email_personal', encabezado: 'Correo personal', sinonimos: ['email personal', 'correo alterno'], ayuda: '', ejemplo: 'ana@gmail.com' },
  { clave: 'sede', encabezado: 'Sede', sinonimos: ['ubicacion', 'ciudad', 'oficina'], ayuda: 'Texto libre; usa siempre el mismo nombre.', ejemplo: 'Bogotá' },
  { clave: 'centro_costo', encabezado: 'Centro de costo', sinonimos: ['centro costo', 'cc', 'centro de costos'], ayuda: '', ejemplo: 'CC-100' },
  { clave: 'tipo_contrato', encabezado: 'Tipo de contrato', sinonimos: ['contrato', 'tipo contrato'], ayuda: Object.values(TIPOS_CONTRATO).join(', ') + '.', ejemplo: 'Término indefinido' },
  { clave: 'modalidad', encabezado: 'Modalidad', sinonimos: ['modalidad de trabajo', 'trabajo'], ayuda: Object.values(MODALIDADES).join(', ') + '.', ejemplo: 'Híbrido' },
  { clave: 'jornada', encabezado: 'Jornada', sinonimos: ['tipo de jornada', 'dedicacion'], ayuda: Object.values(JORNADAS).join(', ') + '.', ejemplo: 'Tiempo completo' },
  { clave: 'salario', encabezado: 'Salario', sinonimos: ['sueldo', 'salario base', 'remuneracion', 'salario mensual'], ayuda: 'Monto (ej. 3500000 o 3.500.000). Si cambia respecto al vigente, se registra un ajuste en el historial.', ejemplo: '3500000' },
  { clave: 'moneda', encabezado: 'Moneda', sinonimos: ['divisa'], ayuda: MONEDAS.join(', ') + '. Vacío = moneda principal.', ejemplo: 'COP' },
  { clave: 'periodicidad', encabezado: 'Periodicidad salario', sinonimos: ['periodicidad', 'periodo salario', 'frecuencia'], ayuda: Object.values(PERIODICIDADES).join(', ') + '. Vacío = Mensual.', ejemplo: 'Mensual' },
  { clave: 'salario_desde', encabezado: 'Salario vigente desde', sinonimos: ['vigencia salario', 'fecha salario', 'vigente desde'], ayuda: 'Vacío = hoy.', ejemplo: '2025-01-01', tipo: 'fecha' },
  { clave: 'motivo_salario', encabezado: 'Motivo salario', sinonimos: ['motivo', 'motivo ajuste'], ayuda: 'Vacío = "Carga masiva".', ejemplo: 'Aumento anual' },
  { clave: 'potencial', encabezado: 'Potencial', sinonimos: ['nivel de potencial', 'potencial nine box'], ayuda: 'Bajo, Medio o Alto (o 1, 2, 3). Carga inicial: luego se puede refinar con la evaluación de 5 dimensiones.', ejemplo: 'Medio' },
];

export const columnaPorClave = (c: ClaveColumna) => COLUMNAS.find(x => x.clave === c)!;

/** Relaciona automáticamente cada encabezado del archivo con una columna conocida (o null si no la reconoce). */
export function detectarMapeo<K extends string = ClaveColumna>(encabezados: string[], columnas: DefColumna<K>[] = COLUMNAS as unknown as DefColumna<K>[]): (K | null)[] {
  const COLUMNAS = columnas;
  const usadas = new Set<K>();
  return encabezados.map(h => {
    const n = normalizarTexto(h).replace(/[*:_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return null;
    const exacta = COLUMNAS.find(c => !usadas.has(c.clave) && (normalizarTexto(c.encabezado) === n || c.sinonimos.includes(n)));
    const parcial = exacta ?? COLUMNAS.find(c => !usadas.has(c.clave) && [c.encabezado, ...c.sinonimos].some(s => n.startsWith(normalizarTexto(s))));
    if (parcial) usadas.add(parcial.clave);
    return parcial?.clave ?? null;
  });
}

// ------------------------------------------------------------------
// Normalización de valores
// ------------------------------------------------------------------

/** Fecha → AAAA-MM-DD. Acepta ISO, DD/MM/AAAA, DD-MM-AAAA y número de serie de Excel. null si no es válida. */
export function normalizarFecha(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let a: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +r[1]; m = +r[2]; a = +r[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(t)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5);
    return f.toISOString().slice(0, 10);
  } else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** Busca un valor de catálogo por clave o etiqueta, sin distinguir mayúsculas ni tildes. */
function deCatalogo<K extends string>(v: string, catalogo: Record<K, string>): K | null {
  const n = normalizarTexto(v);
  if (!n) return null;
  const entrada = (Object.entries(catalogo) as [K, string][]).find(([k, etiqueta]) =>
    normalizarTexto(k) === n || normalizarTexto(etiqueta) === n || normalizarTexto(k).replace(/_/g, ' ') === n);
  return entrada?.[0] ?? null;
}

const SINONIMOS_CATALOGO: Record<string, string> = {
  'indefinido': 'indefinido', 'fijo': 'fijo', 'termino fijo': 'fijo', 'obra': 'obra_labor', 'obra labor': 'obra_labor',
  'prestacion de servicios': 'prestacion_servicios', 'servicios': 'prestacion_servicios', 'aprendiz': 'aprendizaje', 'practicante': 'practicas',
  'presencial': 'presencial', 'remoto': 'remoto', 'teletrabajo': 'remoto', 'hibrido': 'hibrido',
  'completa': 'completa', 'tiempo completo': 'completa', 'parcial': 'parcial', 'medio tiempo': 'parcial', 'por horas': 'por_horas',
  'mensual': 'mensual', 'anual': 'anual', 'por hora': 'por_hora', 'hora': 'por_hora',
};
export const conSinonimos = <K extends string>(v: string, catalogo: Record<K, string>): K | null =>
  deCatalogo(v, catalogo) ?? ((SINONIMOS_CATALOGO[normalizarTexto(v)] as K) in catalogo ? SINONIMOS_CATALOGO[normalizarTexto(v)] as K : null);

export function normalizarPotencial(v: string): 1 | 2 | 3 | null {
  const n = normalizarTexto(v);
  if (['1', 'bajo', 'baja'].includes(n)) return 1;
  if (['2', 'medio', 'media'].includes(n)) return 2;
  if (['3', 'alto', 'alta'].includes(n)) return 3;
  return null;
}

// ------------------------------------------------------------------
// Análisis
// ------------------------------------------------------------------

export interface FilaArchivo { numero: number; valores: Partial<Record<ClaveColumna, string>> }

export interface OpcionesImportacion {
  crearPuestos: boolean;
  crearAreas: boolean;
}

export interface ContextoImportacion {
  activos: Empleado[];
  desvinculados: Empleado[];
  areas: Area[];
  puestos: Puesto[];
  /** Salario vigente por colaborador (para detectar si cambia) */
  salariosVigentes: Map<number, { salario: number; moneda: string; periodicidad: Periodicidad }>;
  /** Correo del Admin que importa: no puede cambiarse su propio tipo de perfil */
  emailImportador: string;
  monedaPorDefecto: string;
  /** Aplica las unificaciones de nombres parecidos que decidió el Admin (ver lib/estructura.ts) */
  homologar?: (tipo: 'area' | 'cargo', nombre: string, ambitoArea?: string) => string;
  /** Líderes que asigna la hoja Áreas: id de área → email del líder */
  lideresAsignados?: Map<string, string>;
}

/** Cargo que se creará desde la hoja Colaboradores (opción "crear los que no existen"), dentro del área del colaborador */
export interface CargoNuevo { nombre: string; areaNombre: string }

export interface Cambio { campo: string; antes: string; despues: string }

export type AccionFila = 'crear' | 'actualizar' | 'sin_cambios' | 'error';

export interface FilaAnalizada {
  numero: number;
  email: string;
  nombre: string;
  accion: AccionFila;
  errores: string[];
  advertencias: string[];
  cambios: Cambio[];
  empleadoId?: number;
  /** Datos finales del colaborador (existentes + lo que trae el archivo) */
  datos?: DatosColaborador;
  /** Nombres (no ids) de área y puesto, por si hay que crearlos */
  areaNombre?: string | null;
  puestoNombre?: string;
  jefeEmail?: string | null;
  /** Documento que trae el archivo (para detectar repetidos entre filas) */
  documentoArchivo?: string;
  compensacion?: DatosCompensacion;
  potencial?: 1 | 2 | 3;
}

export interface ResultadoAnalisis {
  filas: FilaAnalizada[];
  puestosNuevos: CargoNuevo[];
  areasNuevas: string[];
  resumen: Record<AccionFila, number>;
}

const ETIQUETA: Partial<Record<keyof DatosColaborador, string>> = {
  nombre: 'Nombre', puesto_id: 'Cargo', tipo_perfil: 'Tipo de perfil', area_id: 'Área', jefe_directo_id: 'Jefe directo',
  fecha_ingreso: 'Fecha de ingreso', tipo_documento: 'Tipo de documento', numero_documento: 'Documento',
  fecha_nacimiento: 'Fecha de nacimiento', telefono: 'Teléfono', email_personal: 'Correo personal', sede: 'Sede',
  centro_costo: 'Centro de costo', tipo_contrato: 'Contrato', modalidad: 'Modalidad', jornada: 'Jornada',
};

/**
 * Analiza todas las filas: decide si cada una crea, actualiza, no cambia nada o tiene errores,
 * y lista exactamente qué campos cambian. Las celdas vacías NO borran datos existentes.
 */
export function analizarImportacion(filasArchivo: FilaArchivo[], ctx: ContextoImportacion, op: OpcionesImportacion): ResultadoAnalisis {
  const porEmail = new Map(ctx.activos.filter(e => emailNormalizado(e.email)).map(e => [emailNormalizado(e.email), e]));
  const desvPorEmail = new Map(ctx.desvinculados.filter(e => emailNormalizado(e.email)).map(e => [emailNormalizado(e.email), e]));
  const areaPorNombre = new Map(ctx.areas.map(a => [normalizarNombre(a.nombre), a]));
  const homologar = ctx.homologar ?? ((_t: string, n: string) => n);
  // Copias: se les agregan los que se crean desde esta hoja, para que las filas siguientes los reconozcan
  const areas = [...ctx.areas];
  const puestos = [...ctx.puestos];
  const nombreArea = (id: string) => areas.find(a => String(a.id) === id)?.nombre || '';
  const nombrePuesto = (id: string) => { const p = puestos.find(x => String(x.id) === id); return p ? etiquetaCargo(p, areas, puestos) : ''; };
  const emailsArchivo = new Map<string, number>();
  filasArchivo.forEach(f => { const e = (f.valores.email || '').trim().toLowerCase(); if (e) emailsArchivo.set(e, (emailsArchivo.get(e) || 0) + 1); });

  const puestosNuevos = new Map<string, CargoNuevo>();
  const areasNuevas = new Map<string, string>();
  // Ids temporales (negativos) para áreas/puestos que se crearán, así la validación los trata como válidos
  let idTemporal = -1;
  const idAreaNueva = new Map<string, number>();

  const filas: FilaAnalizada[] = filasArchivo.map(f => {
    const v = f.valores;
    const t = (c: ClaveColumna) => (v[c] ?? '').toString().trim();
    const email = t('email').toLowerCase();
    const fila: FilaAnalizada = { numero: f.numero, email, nombre: t('nombre'), accion: 'error', errores: [], advertencias: [], cambios: [] };
    const err = (m: string) => fila.errores.push(m);

    if (!email) { err('Falta el Email.'); return fila; }
    if ((emailsArchivo.get(email) || 0) > 1) err('Este correo aparece más de una vez en el archivo.');
    if (desvPorEmail.has(email)) {
      err(`${desvPorEmail.get(email)!.nombre} está desvinculado: reactívalo desde "Colaboradores desvinculados" antes de actualizarlo.`);
      return fila;
    }

    const existente = porEmail.get(email);
    const esNuevo = !existente;
    fila.empleadoId = existente?.id;
    if (existente && !fila.nombre) fila.nombre = existente.nombre;
    const base = existente ? datosDesdeEmpleado(existente, ctx.puestos) : { ...datosVacios(), email, fecha_ingreso: '' };
    const d: DatosColaborador = { ...base };

    if (esNuevo) {
      COLUMNAS.filter(c => c.obligatoria === 'crear' && !t(c.clave)).forEach(c => err(`Falta "${c.encabezado}" (obligatorio para colaboradores nuevos).`));
    }

    // Textos simples
    if (t('nombre')) d.nombre = t('nombre');
    if (t('telefono')) d.telefono = t('telefono');
    if (t('email_personal')) d.email_personal = t('email_personal');
    if (t('sede')) d.sede = t('sede');
    if (t('centro_costo')) d.centro_costo = t('centro_costo');
    if (t('numero_documento')) { d.numero_documento = t('numero_documento'); fila.documentoArchivo = t('numero_documento').replace(/\s+/g, '').toUpperCase(); }

    // Tipo de documento
    if (t('tipo_documento')) {
      const td = TIPOS_DOCUMENTO.find(x => normalizarTexto(x) === normalizarTexto(t('tipo_documento')));
      if (td) d.tipo_documento = td; else err(`Tipo de documento "${t('tipo_documento')}" no válido (${TIPOS_DOCUMENTO.join(', ')}).`);
    }

    // Catálogos
    if (t('tipo_contrato')) { const x = conSinonimos(t('tipo_contrato'), TIPOS_CONTRATO); if (x) d.tipo_contrato = x; else err(`Tipo de contrato "${t('tipo_contrato')}" no válido.`); }
    if (t('modalidad')) { const x = conSinonimos(t('modalidad'), MODALIDADES); if (x) d.modalidad = x; else err(`Modalidad "${t('modalidad')}" no válida.`); }
    if (t('jornada')) { const x = conSinonimos(t('jornada'), JORNADAS); if (x) d.jornada = x; else err(`Jornada "${t('jornada')}" no válida.`); }

    // Tipo de perfil (no se puede cambiar el propio)
    if (t('tipo_perfil')) {
      const rol = ROLES.find(r => normalizarTexto(r) === normalizarTexto(t('tipo_perfil')));
      if (!rol) err(`Tipo de perfil "${t('tipo_perfil')}" no válido (${ROLES.join(', ')}).`);
      else {
        if (existente && email === ctx.emailImportador.trim().toLowerCase() && rol !== (existente.tipo_perfil || 'Empleado')) {
          err('No puedes cambiar tu propio tipo de perfil.');
        }
        d.tipo_perfil = rol;
      }
    }

    // Fechas
    for (const c of ['fecha_ingreso', 'fecha_nacimiento'] as const) {
      if (!t(c)) continue;
      const iso = normalizarFecha(t(c));
      if (iso) d[c] = iso; else err(`"${columnaPorClave(c).encabezado}" no es una fecha válida (usa AAAA-MM-DD o DD/MM/AAAA).`);
    }

    // Área (por nombre, ya unificada). Va antes que el cargo porque el cargo se busca dentro del área.
    if (t('area')) {
      const nombreA = limpiarNombre(homologar('area', t('area')));
      const a = areaPorNombre.get(normalizarNombre(nombreA));
      if (a) { d.area_id = String(a.id); fila.areaNombre = a.nombre; }
      else if (op.crearAreas) {
        const k = normalizarNombre(nombreA);
        if (!idAreaNueva.has(k)) {
          const id = idTemporal--;
          idAreaNueva.set(k, id); areasNuevas.set(k, nombreA);
          const nueva: Area = { id, nombre: nombreA, lider_id: null, parent_id: null };
          areas.push(nueva); areaPorNombre.set(k, nueva);
        }
        d.area_id = String(idAreaNueva.get(k)); fila.areaNombre = areasNuevas.get(k);
        fila.advertencias.push(`Se creará el área "${areasNuevas.get(k)}" (como área principal; agrégala a la hoja Áreas para ubicarla).`);
      } else err(`El área "${t('area')}" no existe: agrégala a la hoja Áreas.`);
    } else {
      // Sin área en la fila: si la hoja Áreas la nombra líder de un área, pertenece a esa área
      const liderDe = [...(ctx.lideresAsignados || [])].find(([, correo]) => correo === email)?.[0];
      if (liderDe) d.area_id = liderDe;
      fila.areaNombre = d.area_id ? nombreArea(d.area_id) : null;
    }

    // Cargo (por nombre, dentro del área final del colaborador)
    if (t('puesto')) {
      const areaIdNum = d.area_id ? Number(d.area_id) : null;
      const nombreC = limpiarNombre(homologar('cargo', t('puesto'), normalizarNombre(fila.areaNombre || '')));
      const r = resolverCargo(nombreC, areaIdNum, puestos, areas);
      if (r.ok) {
        d.puesto_id = String(r.puesto.id); fila.puestoNombre = r.puesto.nombre;
        if (r.aviso) fila.advertencias.push(r.aviso);
      } else if (r.noExiste && op.crearPuestos) {
        if (areaIdNum === null) err(`Para crear el cargo "${nombreC}" el colaborador debe tener área.`);
        else {
          const nuevo: Puesto = { id: idTemporal--, nombre: nombreC, area_id: areaIdNum };
          puestos.push(nuevo);
          puestosNuevos.set(`${normalizarNombre(fila.areaNombre || '')}|${normalizarNombre(nombreC)}`, { nombre: nombreC, areaNombre: fila.areaNombre || '' });
          d.puesto_id = String(nuevo.id); fila.puestoNombre = nombreC;
          fila.advertencias.push(`Se creará el cargo "${nombreC}" en "${fila.areaNombre}".`);
        }
      } else err(r.noExiste ? `El cargo "${t('puesto')}" no existe: agrégalo a la hoja Cargos con su área.` : r.error);
    } else if (existente) {
      fila.puestoNombre = nombrePuesto(d.puesto_id) || existente.puesto;
      // Si cambia de área y su cargo es de otra área, se avisa
      const p = puestos.find(x => String(x.id) === d.puesto_id);
      if (p?.area_id != null && d.area_id && d.area_id !== base.area_id && String(p.area_id) !== d.area_id) {
        fila.advertencias.push(`Su cargo "${p.nombre}" pertenece a "${nombreArea(String(p.area_id))}", no a su nueva área.`);
      }
    }

    // Jefe directo (por correo: alguien activo o del mismo archivo)
    if (t('jefe_email')) {
      const je = t('jefe_email').toLowerCase();
      if (je === email) err('Una persona no puede ser su propio jefe.');
      else if (porEmail.has(je)) { d.jefe_directo_id = String(porEmail.get(je)!.id); fila.jefeEmail = je; }
      else if (emailsArchivo.has(je)) { d.jefe_directo_id = ''; fila.jefeEmail = je; } // se resuelve al crear
      else err(`El jefe directo "${t('jefe_email')}" no existe ni está en el archivo.`);
    }

    // Salario
    if (t('salario')) {
      const monto = parsearMonto(t('salario'));
      const moneda = (t('moneda') || ctx.monedaPorDefecto).toUpperCase();
      const periodicidad = t('periodicidad') ? conSinonimos(t('periodicidad'), PERIODICIDADES) : 'mensual';
      const desde = t('salario_desde') ? normalizarFecha(t('salario_desde')) : hoyISO();
      if (monto === null || monto <= 0) err(`Salario "${t('salario')}" no válido.`);
      else if (!(MONEDAS as readonly string[]).includes(moneda)) err(`Moneda "${moneda}" no válida (${MONEDAS.join(', ')}).`);
      else if (!periodicidad) err(`Periodicidad "${t('periodicidad')}" no válida.`);
      else if (!desde) err('"Salario vigente desde" no es una fecha válida.');
      else {
        const vigente = existente ? ctx.salariosVigentes.get(existente.id) : undefined;
        const igual = vigente && Math.abs(vigente.salario - monto) < 0.005 && vigente.moneda === moneda && vigente.periodicidad === periodicidad;
        if (!igual) {
          fila.compensacion = { salario: String(monto), moneda, periodicidad, fecha_vigencia: desde, motivo: t('motivo_salario') || 'Carga masiva' };
          fila.cambios.push({
            campo: 'Salario',
            antes: vigente ? `${vigente.salario.toLocaleString('es-CO')} ${vigente.moneda}` : '—',
            despues: `${monto.toLocaleString('es-CO')} ${moneda}${periodicidad !== 'mensual' ? ` (${PERIODICIDADES[periodicidad].toLowerCase()})` : ''}`,
          });
        }
      }
    }

    // Potencial
    if (t('potencial')) {
      const p = normalizarPotencial(t('potencial'));
      if (!p) err(`Potencial "${t('potencial')}" no válido (Bajo, Medio o Alto).`);
      else if (p !== existente?.potencial_score) {
        fila.potencial = p;
        fila.cambios.push({ campo: 'Potencial', antes: ['—', 'Bajo', 'Medio', 'Alto'][existente?.potencial_score || 0], despues: ['', 'Bajo', 'Medio', 'Alto'][p] });
      }
    }

    // Validación de negocio con las mismas reglas del formulario
    const otros = ctx.activos.filter(e => e.id !== existente?.id);
    const errValidacion = validarColaborador(
      { ...d, email, puesto_id: d.puesto_id || (existente ? 'x' : '') },
      { empleadoId: existente?.id ?? undefined, activos: existente ? ctx.activos : otros, desvinculados: ctx.desvinculados },
    );
    // El correo ya se valida arriba (crear vs. actualizar); el jefe del mismo archivo se resuelve después
    delete errValidacion.email; delete errValidacion.puesto_id;
    if (esNuevo && !EMAIL_VALIDO.test(email)) err('Email no válido.');
    Object.values(errValidacion).forEach(m => m && err(m));

    // Cambios de la ficha (solo si existe)
    if (existente) {
      (Object.keys(ETIQUETA) as (keyof DatosColaborador)[]).forEach(campo => {
        const antes = String(base[campo] ?? '');
        const despues = String(d[campo] ?? '');
        if (campo === 'jefe_directo_id' && fila.jefeEmail && !porEmail.has(fila.jefeEmail)) {
          fila.cambios.push({ campo: 'Jefe directo', antes: nombreDe(ctx.activos, antes), despues: fila.jefeEmail });
          return;
        }
        if (antes === despues) return;
        const legible = (x: string) => campo === 'area_id' ? nombreArea(x)
          : campo === 'puesto_id' ? (nombrePuesto(x) || (x === base.puesto_id ? existente.puesto : fila.puestoNombre || ''))
          : campo === 'jefe_directo_id' ? nombreDe(ctx.activos, x)
          : campo === 'tipo_contrato' ? TIPOS_CONTRATO[x as keyof typeof TIPOS_CONTRATO] || x
          : campo === 'modalidad' ? MODALIDADES[x as keyof typeof MODALIDADES] || x
          : campo === 'jornada' ? JORNADAS[x as keyof typeof JORNADAS] || x : x;
        fila.cambios.push({ campo: ETIQUETA[campo]!, antes: legible(antes) || '—', despues: legible(despues) || '—' });
      });
    }

    fila.datos = d;
    fila.accion = fila.errores.length > 0 ? 'error' : esNuevo ? 'crear' : fila.cambios.length > 0 ? 'actualizar' : 'sin_cambios';
    return fila;
  });

  // Validaciones entre filas: documento repetido, varios líderes para un área, ciclos de jefatura
  validarEntreFilas(filas, ctx);

  const resumen: Record<AccionFila, number> = { crear: 0, actualizar: 0, sin_cambios: 0, error: 0 };
  filas.forEach(f => { resumen[f.accion]++; });
  // Solo se crean cargos/áreas que usa alguna fila válida
  const validas = filas.filter(f => f.accion === 'crear' || f.accion === 'actualizar');
  const areasUsadas = new Set(validas.map(f => normalizarNombre(f.areaNombre || '')));
  const cargosUsados = new Set(validas.map(f => `${normalizarNombre(f.areaNombre || '')}|${normalizarNombre(f.puestoNombre || '')}`));
  return {
    filas,
    puestosNuevos: [...puestosNuevos.entries()].filter(([k]) => cargosUsados.has(k)).map(([, n]) => n),
    areasNuevas: [...areasNuevas.entries()].filter(([k]) => areasUsadas.has(k)).map(([, n]) => n),
    resumen,
  };
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const nombreDe = (lista: Empleado[], id: string) => lista.find(e => String(e.id) === id)?.nombre || (id ? `#${id}` : '');

function validarEntreFilas(filas: FilaAnalizada[], ctx: ContextoImportacion) {
  const marcarError = (f: FilaAnalizada, m: string) => { f.errores.push(m); f.accion = 'error'; };

  // Documento repetido dentro del archivo
  const docs = new Map<string, FilaAnalizada[]>();
  filas.forEach(f => {
    const n = f.documentoArchivo; // solo los documentos que vienen en el archivo (no los que ya tenía cada persona)
    if (f.datos?.tipo_documento && n) docs.set(`${f.datos.tipo_documento}|${n}`, [...(docs.get(`${f.datos.tipo_documento}|${n}`) || []), f]);
  });
  docs.forEach(lista => { if (lista.length > 1) lista.forEach(f => marcarError(f, `Documento repetido en el archivo (filas ${lista.map(x => x.numero).join(', ')}).`)); });

  // Un área no puede quedar con dos líderes
  const lideres = new Map<string, FilaAnalizada[]>();
  filas.forEach(f => {
    if (f.accion === 'error' || f.datos?.tipo_perfil !== 'Líder de Área' || !f.datos.area_id) return;
    lideres.set(f.datos.area_id, [...(lideres.get(f.datos.area_id) || []), f]);
  });
  lideres.forEach((lista, areaId) => {
    if (lista.length > 1) lista.forEach(f => marcarError(f, `Hay más de un "Líder de Área" para ${f.areaNombre || 'esa área'} en el archivo.`));
    // Una persona lidera una sola área: si ya lideraba otra, la deja
    lista.forEach(f => {
      const otra = f.empleadoId ? ctx.areas.find(a => a.lider_id === f.empleadoId && String(a.id) !== areaId) : undefined;
      if (otra) f.advertencias.push(`Dejará de liderar "${otra.nombre}" (una persona lidera una sola área).`);
    });
    const asignado = ctx.lideresAsignados?.get(areaId);
    if (asignado) {
      // La hoja Áreas manda: el líder del área es quien diga su columna "Email líder"
      if (lista.length === 1 && lista[0].email !== asignado) marcarError(lista[0], `En la hoja Áreas el líder de "${lista[0].areaNombre}" es ${asignado}.`);
      return;
    }
    const area = ctx.areas.find(a => String(a.id) === areaId);
    if (area?.lider_id && lista.length === 1 && lista[0].empleadoId !== area.lider_id) {
      const actual = ctx.activos.find(e => e.id === area.lider_id);
      marcarError(lista[0], `El área "${area.nombre}" ya tiene líder (${actual?.nombre || 'asignado'}).`);
    }
  });

  // Ciclos de jefatura con el resultado final (existentes + archivo)
  const jefeDe = new Map<string, string>(); // email → email del jefe
  ctx.activos.forEach(e => {
    const jefe = ctx.activos.find(j => j.id === e.jefe_directo_id);
    if (jefe && emailNormalizado(e.email) && emailNormalizado(jefe.email)) jefeDe.set(emailNormalizado(e.email), emailNormalizado(jefe.email));
  });
  const emailPorId = new Map(ctx.activos.map(e => [String(e.id), emailNormalizado(e.email)]));
  filas.forEach(f => {
    if (f.accion === 'error') return;
    if (f.jefeEmail) jefeDe.set(f.email, f.jefeEmail);
    else if (f.datos?.jefe_directo_id) { const je = emailPorId.get(f.datos.jefe_directo_id); if (je) jefeDe.set(f.email, je); }
  });
  filas.forEach(f => {
    if (f.accion === 'error') return;
    const vistos = new Set([f.email]);
    let actual = jefeDe.get(f.email);
    while (actual) {
      if (vistos.has(actual)) { marcarError(f, 'La jefatura forma un ciclo (alguien termina reportándose a sí mismo).'); break; }
      vistos.add(actual);
      actual = jefeDe.get(actual);
    }
  });
}
