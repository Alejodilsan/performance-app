import type { Perfil, TipoPerfil } from './tipos'

export type RolAcceso = Perfil['rol'];

/**
 * El "Tipo de Perfil" de un colaborador (empleados.tipo_perfil) es la fuente de verdad;
 * perfiles.rol es lo que la app usa para dar permisos, y siempre se deriva de aquí.
 */
export const ROL_POR_TIPO_PERFIL: Record<TipoPerfil, RolAcceso> = {
  'Admin': 'admin',
  'Manager': 'manager',
  'Auditor': 'auditor',
  'Líder de Área': 'lider_area',
  'Empleado': 'empleado',
};

export const rolDesdeTipoPerfil = (tipo?: TipoPerfil | null): RolAcceso =>
  (tipo && ROL_POR_TIPO_PERFIL[tipo]) || 'empleado';
