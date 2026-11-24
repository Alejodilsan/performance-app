// Alta de empresas (multi-tenant): datos, validación y valores iniciales. Funciones puras.
import { normalizarNombre } from './similitud'

export interface DatosAltaEmpresa {
  empresa: string;
  adminNombre: string;
  adminEmail: string;
  /** Cargo del Admin en su ficha de colaborador */
  adminCargo: string;
  moneda: string;
}

/** Niveles de cargo con que arranca cada empresa (los edita después desde Cargos) */
export const NIVELES_BASE = ['Operativo', 'Técnico', 'Profesional', 'Coordinación', 'Jefatura', 'Gerencia', 'Dirección'];

/** Monedas habituales de los clientes (se acepta cualquier código ISO de 3 letras) */
export const MONEDAS_SUGERIDAS = ['COP', 'USD', 'MXN', 'PEN', 'CLP', 'EUR'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarAlta(d: Partial<DatosAltaEmpresa>): DatosAltaEmpresa {
  const limpio = (v?: string) => (v ?? '').replace(/\s+/g, ' ').trim();
  return {
    empresa: limpio(d.empresa),
    adminNombre: limpio(d.adminNombre),
    adminEmail: limpio(d.adminEmail).toLowerCase(),
    adminCargo: limpio(d.adminCargo) || 'Administrador de la plataforma',
    moneda: (limpio(d.moneda) || 'COP').toUpperCase(),
  };
}

/** Errores de los datos (vacío = válidos). `empresasExistentes` = nombres ya registrados. */
export function validarAlta(d: DatosAltaEmpresa, empresasExistentes: string[] = []): string[] {
  const errores: string[] = [];
  if (d.empresa.length < 2) errores.push('Escribe el nombre de la empresa.');
  else if (empresasExistentes.some(n => normalizarNombre(n) === normalizarNombre(d.empresa))) errores.push(`Ya existe una empresa llamada "${d.empresa}".`);
  if (d.adminNombre.length < 3) errores.push('Escribe el nombre completo del Admin.');
  if (!EMAIL.test(d.adminEmail)) errores.push('El correo del Admin no es válido.');
  if (!/^[A-Z]{3}$/.test(d.moneda)) errores.push('La moneda debe ser un código de 3 letras (p. ej. COP, USD).');
  return errores;
}
