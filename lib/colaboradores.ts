// Lógica del formulario de colaborador (alta y edición). Reutilizable por la carga masiva.
import {
  TIPOS_CONTRATO, MODALIDADES, JORNADAS, PERIODICIDADES,
  type Empleado, type Puesto, type TipoPerfil, type TipoContrato, type Modalidad, type Jornada, type Periodicidad,
} from './tipos'
import { normalizarTexto } from './jerarquia'

/** Valores del formulario: todo como string, tal como lo manejan los inputs ('' = vacío). */
export interface DatosColaborador {
  // Esenciales
  nombre: string;
  email: string;
  puesto_id: string;
  tipo_perfil: TipoPerfil;
  area_id: string;
  jefe_directo_id: string;
  fecha_ingreso: string;
  // Personales
  tipo_documento: string;
  numero_documento: string;
  fecha_nacimiento: string;
  telefono: string;
  email_personal: string;
  // Laborales
  sede: string;
  tipo_contrato: TipoContrato | '';
  modalidad: Modalidad | '';
  jornada: Jornada | '';
  centro_costo: string;
}

export interface DatosCompensacion {
  salario: string;
  moneda: string;
  periodicidad: Periodicidad;
  fecha_vigencia: string;
  motivo: string;
}

export const hoyISO = () => new Date().toISOString().slice(0, 10);

export function datosVacios(): DatosColaborador {
  return {
    nombre: '', email: '', puesto_id: '', tipo_perfil: 'Empleado', area_id: '', jefe_directo_id: '', fecha_ingreso: hoyISO(),
    tipo_documento: '', numero_documento: '', fecha_nacimiento: '', telefono: '', email_personal: '',
    sede: '', tipo_contrato: '', modalidad: '', jornada: '', centro_costo: '',
  };
}

export function datosDesdeEmpleado(emp: Empleado, puestos: Puesto[]): DatosColaborador {
  // Si el puesto guardado no está vinculado al catálogo, se intenta encontrar por nombre
  const puestoId = emp.puesto_id ?? puestos.find(p => normalizarTexto(p.nombre) === normalizarTexto(emp.puesto))?.id;
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    nombre: emp.nombre, email: emp.email, puesto_id: s(puestoId), tipo_perfil: emp.tipo_perfil || 'Empleado',
    area_id: s(emp.area_id), jefe_directo_id: s(emp.jefe_directo_id), fecha_ingreso: s(emp.fecha_ingreso),
    tipo_documento: s(emp.tipo_documento), numero_documento: s(emp.numero_documento), fecha_nacimiento: s(emp.fecha_nacimiento),
    telefono: s(emp.telefono), email_personal: s(emp.email_personal),
    sede: s(emp.sede), tipo_contrato: emp.tipo_contrato || '', modalidad: emp.modalidad || '', jornada: emp.jornada || '',
    centro_costo: s(emp.centro_costo),
  };
}

export function compensacionVacia(moneda = 'COP'): DatosCompensacion {
  return { salario: '', moneda, periodicidad: 'mensual', fecha_vigencia: hoyISO(), motivo: '' };
}

// ------------------------------------------------------------------
// Conversión al formato de la base de datos
// ------------------------------------------------------------------

const textoONull = (v: string) => (v.trim() === '' ? null : v.trim());
const enteroONull = (v: string) => (v === '' ? null : parseInt(v, 10));

/** Columnas de `empleados` a partir del formulario (sin email: se fija al crear y luego no se edita). */
export function payloadEmpleado(d: DatosColaborador, puestos: Puesto[]) {
  const puesto = puestos.find(p => p.id === parseInt(d.puesto_id, 10));
  return {
    nombre: d.nombre.trim(),
    puesto: puesto?.nombre || 'Colaborador',
    puesto_id: puesto?.id ?? null,
    tipo_perfil: d.tipo_perfil,
    area_id: enteroONull(d.area_id),
    jefe_directo_id: enteroONull(d.jefe_directo_id),
    fecha_ingreso: textoONull(d.fecha_ingreso),
    tipo_documento: textoONull(d.tipo_documento),
    numero_documento: d.numero_documento.trim() === '' ? null : d.numero_documento.replace(/\s+/g, '').toUpperCase(),
    fecha_nacimiento: textoONull(d.fecha_nacimiento),
    telefono: textoONull(d.telefono),
    email_personal: d.email_personal.trim() === '' ? null : d.email_personal.trim().toLowerCase(),
    sede: textoONull(d.sede),
    tipo_contrato: d.tipo_contrato || null,
    modalidad: d.modalidad || null,
    jornada: d.jornada || null,
    centro_costo: textoONull(d.centro_costo),
  };
}

/**
 * Convierte un monto escrito a mano en número: "3.500.000", "3,500,000", "3500000,50", "$ 2.400.000".
 * Si el último separador va seguido de 1 o 2 dígitos se toma como decimal.
 */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,]/g, '');
  if (!limpio) return null;
  const ultimo = Math.max(limpio.lastIndexOf('.'), limpio.lastIndexOf(','));
  let normal = limpio;
  if (ultimo >= 0 && /^\d{1,2}$/.test(limpio.slice(ultimo + 1))) {
    normal = limpio.slice(0, ultimo).replace(/[.,]/g, '') + '.' + limpio.slice(ultimo + 1);
  } else {
    normal = limpio.replace(/[.,]/g, '');
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export const formatearMonto = (valor: number, moneda: string) => {
  try {
    const decimales = Number.isInteger(valor) ? 0 : 2;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
  } catch {
    return `${moneda} ${valor.toLocaleString('es-CO')}`;
  }
};

// ------------------------------------------------------------------
// Validaciones
// ------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_RE = /^\+?[\d\s()-]{7,20}$/;

export interface ContextoValidacion {
  empleadoId?: number;          // al editar
  activos: Empleado[];
  desvinculados: Empleado[];
}

/** Devuelve un mapa campo → mensaje. Vacío = válido. */
export function validarColaborador(d: DatosColaborador, ctx: ContextoValidacion): Partial<Record<keyof DatosColaborador, string>> {
  const errores: Partial<Record<keyof DatosColaborador, string>> = {};
  const otros = [...ctx.activos, ...ctx.desvinculados].filter(e => e.id !== ctx.empleadoId);
  const hoy = hoyISO();

  if (!d.nombre.trim()) errores.nombre = 'El nombre es obligatorio.';

  const email = d.email.trim().toLowerCase();
  if (!email) errores.email = 'El correo es obligatorio.';
  else if (!EMAIL_RE.test(email)) errores.email = 'Correo no válido.';
  else if (ctx.empleadoId === undefined) {
    const existente = otros.find(e => e.email.trim().toLowerCase() === email);
    if (existente) {
      errores.email = existente.estado_contratacion === 'desvinculado'
        ? `${existente.nombre} ya estuvo en la organización: reactívalo desde "Colaboradores desvinculados" para conservar su histórico.`
        : `Ya existe un colaborador con este correo (${existente.nombre}).`;
    }
  }

  if (!d.puesto_id) errores.puesto_id = 'Selecciona un puesto.';
  if (d.tipo_perfil === 'Líder de Área' && !d.area_id) errores.area_id = "El perfil 'Líder de Área' requiere un área.";
  if (d.jefe_directo_id && ctx.empleadoId !== undefined && parseInt(d.jefe_directo_id, 10) === ctx.empleadoId) {
    errores.jefe_directo_id = 'Una persona no puede ser su propio jefe.';
  }

  // Documento: tipo y número van juntos y no se repiten en la empresa
  const numDoc = d.numero_documento.replace(/\s+/g, '').toUpperCase();
  if (numDoc && !d.tipo_documento) errores.tipo_documento = 'Indica el tipo de documento.';
  if (d.tipo_documento && !numDoc) errores.numero_documento = 'Indica el número de documento.';
  if (numDoc && !/^[A-Z0-9.-]{3,20}$/.test(numDoc)) errores.numero_documento = 'Usa solo letras, números, puntos o guiones (3 a 20).';
  if (numDoc && d.tipo_documento) {
    const dup = otros.find(e => e.tipo_documento === d.tipo_documento && (e.numero_documento || '').toUpperCase() === numDoc);
    if (dup) errores.numero_documento = `Este documento ya está registrado a nombre de ${dup.nombre}.`;
  }

  if (d.fecha_nacimiento) {
    if (d.fecha_nacimiento > hoy) errores.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.';
    else if (edadEnAnios(d.fecha_nacimiento) < 14) errores.fecha_nacimiento = 'La persona debe tener al menos 14 años.';
    else if (edadEnAnios(d.fecha_nacimiento) > 100) errores.fecha_nacimiento = 'Revisa la fecha de nacimiento.';
  }
  if (d.fecha_ingreso && d.fecha_nacimiento && d.fecha_ingreso <= d.fecha_nacimiento) {
    errores.fecha_ingreso = 'La fecha de ingreso debe ser posterior a la de nacimiento.';
  }
  if (d.fecha_ingreso && d.fecha_ingreso > sumarDias(hoy, 365)) errores.fecha_ingreso = 'La fecha de ingreso no puede ser a más de un año.';

  if (d.telefono.trim() && !TELEFONO_RE.test(d.telefono.trim())) errores.telefono = 'Teléfono no válido (7 a 20 dígitos; se permite +, espacios y guiones).';
  if (d.email_personal.trim() && !EMAIL_RE.test(d.email_personal.trim())) errores.email_personal = 'Correo personal no válido.';

  if (d.tipo_contrato && !(d.tipo_contrato in TIPOS_CONTRATO)) errores.tipo_contrato = 'Tipo de contrato no válido.';
  if (d.modalidad && !(d.modalidad in MODALIDADES)) errores.modalidad = 'Modalidad no válida.';
  if (d.jornada && !(d.jornada in JORNADAS)) errores.jornada = 'Jornada no válida.';

  return errores;
}

export function validarCompensacion(c: DatosCompensacion): Partial<Record<keyof DatosCompensacion, string>> {
  const errores: Partial<Record<keyof DatosCompensacion, string>> = {};
  if (!c.salario.trim()) return errores; // opcional
  const monto = parsearMonto(c.salario);
  if (monto === null || monto <= 0) errores.salario = 'Ingresa un monto mayor a 0.';
  if (!c.moneda) errores.moneda = 'Selecciona la moneda.';
  if (!(c.periodicidad in PERIODICIDADES)) errores.periodicidad = 'Periodicidad no válida.';
  if (!c.fecha_vigencia) errores.fecha_vigencia = 'Indica desde cuándo rige.';
  return errores;
}

function edadEnAnios(fechaISO: string): number {
  const n = new Date(fechaISO + 'T00:00:00');
  const hoy = new Date();
  let edad = hoy.getFullYear() - n.getFullYear();
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) edad--;
  return edad;
}

function sumarDias(fechaISO: string, dias: number): string {
  const f = new Date(fechaISO + 'T00:00:00');
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
// Jefe directo
// ------------------------------------------------------------------

/**
 * Personas que pueden ser jefe directo de `empleadoId`: todos los activos menos él mismo
 * y menos quienes ya le reportan (directa o indirectamente), para no crear ciclos.
 */
export function opcionesJefeDirecto(activos: Empleado[], empleadoId?: number): Empleado[] {
  if (empleadoId === undefined) return activos;
  const subordinados = new Set<number>();
  let frontera = [empleadoId];
  while (frontera.length > 0) {
    const siguientes = activos.filter(e => e.jefe_directo_id != null && frontera.includes(e.jefe_directo_id) && !subordinados.has(e.id) && e.id !== empleadoId);
    siguientes.forEach(e => subordinados.add(e.id));
    frontera = siguientes.map(e => e.id);
  }
  return activos.filter(e => e.id !== empleadoId && !subordinados.has(e.id));
}
