// Tipos de dominio compartidos por el dashboard y sus componentes

export type TipoPerfil = 'Admin' | 'Manager' | 'Líder de Área' | 'Empleado' | 'Auditor';

export interface Puesto {
  id: number;
  nombre: string;
  empresa_id?: number;
}

// --- TIPOS DE DATOS ---
export interface Area { id: number; nombre: string; lider_id: number | null; parent_id: number | null; children?: Area[]; empleados?: Empleado[]; }
export interface Indicador { 
  id: number; 
  titulo: string; 
  progreso: number; 
  descripcion?: string; 
  unidad_medida?: string; 
  meta_esperada?: number; 
  resultado_actual?: number;
  direccion?: 'creciente' | 'decreciente';
  periodo?: 'mensual' | 'trimestral' | 'semestral' | 'anual';
  feedback_lider?: string; 
  fecha_feedback?: string;
}
export interface DimensionPotencial {
  id: string;
  nombre: string;
  descripcion: string;
  nota: number; // Calificación de 1 a 5
  peso: number; // Porcentaje de 0 a 100
}
export interface Comentario { id: number; autor: string; texto: string; created_at: string; }
export interface Plan { id: number; compromiso: string; estado: string; fecha_limite: string; created_at: string; comentarios?: Comentario[]; }
export interface Evaluacion { id: number; evaluador_id: number; evaluado_id: number; tipo: string; puntuacion: number; feedback: string; created_at: string; }
export interface HistoricoCumplimiento {
  id?: number;
  empleado_id: number;
  empresa_id?: number;
  periodo: string;
  cumplimiento: number;
  potencial_score?: number;
  total_kpis?: number;
  fecha_corte: string;
}
export interface Empleado { 
  id: number; 
  nombre: string; 
  puesto: string; 
  puesto_id?: number | null;
  tipo_perfil?: TipoPerfil;
  job_descripcion?: string; 
  email: string; 
  cumplimiento_general: number; 
  area_id: number | null; 
  potencial_score?: 1 | 2 | 3; 
  indicadores?: Indicador[]; 
  planes_mejora?: Plan[]; 
  historico?: HistoricoCumplimiento[];
  estado_contratacion?: EstadoContratacion;
  fecha_desvinculacion?: string | null;
  motivo_desvinculacion?: string | null;
  // Acceso a la plataforma (ver lib/accesos.ts)
  user_id?: string | null;
  estado_acceso?: 'sin_invitar' | 'invitado' | 'activo';
  fecha_invitacion?: string | null;
  fecha_activacion?: string | null;
  // Ficha: datos personales
  tipo_documento?: string | null;
  numero_documento?: string | null;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email_personal?: string | null;
  // Ficha: datos laborales
  fecha_ingreso?: string | null;
  jefe_directo_id?: number | null;
  sede?: string | null;
  tipo_contrato?: TipoContrato | null;
  modalidad?: Modalidad | null;
  jornada?: Jornada | null;
  centro_costo?: string | null;
  }

// --- Catálogos de la ficha del colaborador (los valores coinciden con los CHECK de la base de datos) ---
export const TIPOS_DOCUMENTO = ['Cédula de ciudadanía', 'Cédula de extranjería', 'Pasaporte', 'PPT', 'DNI', 'RUT', 'Otro'] as const;

export type TipoContrato = 'indefinido' | 'fijo' | 'obra_labor' | 'aprendizaje' | 'practicas' | 'prestacion_servicios';
export const TIPOS_CONTRATO: Record<TipoContrato, string> = {
  indefinido: 'Término indefinido',
  fijo: 'Término fijo',
  obra_labor: 'Obra o labor',
  aprendizaje: 'Aprendizaje',
  practicas: 'Prácticas',
  prestacion_servicios: 'Prestación de servicios',
};

export type Modalidad = 'presencial' | 'remoto' | 'hibrido';
export const MODALIDADES: Record<Modalidad, string> = { presencial: 'Presencial', remoto: 'Remoto', hibrido: 'Híbrido' };

export type Jornada = 'completa' | 'parcial' | 'por_horas';
export const JORNADAS: Record<Jornada, string> = { completa: 'Tiempo completo', parcial: 'Medio tiempo', por_horas: 'Por horas' };

// --- Compensación (tabla aparte, solo Admin: ver migración 20261116) ---
export type Periodicidad = 'mensual' | 'anual' | 'por_hora';
export const PERIODICIDADES: Record<Periodicidad, string> = { mensual: 'Mensual', anual: 'Anual', por_hora: 'Por hora' };
export const MONEDAS = ['COP', 'CLP', 'MXN', 'PEN', 'ARS', 'USD', 'EUR'] as const;

export interface Compensacion {
  id: number;
  empleado_id: number;
  empresa_id: number;
  salario: number;
  moneda: string;
  periodicidad: Periodicidad;
  fecha_vigencia: string;
  motivo: string | null;
  created_at: string;
}

// Un colaborador que sale de la organización no se borra: queda 'desvinculado' para conservar su histórico.
export type EstadoContratacion = 'activo' | 'desvinculado';
export const MOTIVOS_DESVINCULACION = ['Renuncia voluntaria', 'Despido', 'Fin de contrato', 'Jubilación', 'Otro'] as const;
export const estaActivo = (emp: Pick<Empleado, 'estado_contratacion'>) => emp.estado_contratacion !== 'desvinculado';

export interface Perfil {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'manager' | 'lider_area' | 'empleado' | 'auditor';
  empresa_id: number;
}

export interface FuncionesTarjeta {
  asignarAreaEmpleado: (eid: number, aid: string) => Promise<void>;
  actualizarIndicador: (id: number, val: number, eid: number) => Promise<void>;
  actualizarPotencial?: (eid: number, val: number) => Promise<void>;
  agregarIndicador: (eid: number, datosKpi: any) => Promise<void>;
  eliminarIndicador: (id: number) => Promise<void>;
  crearPlan: (eid: number) => Promise<void>;
  completarPlan: (pid: number, est: string) => Promise<void>;
  setExpandidoId: (id: number | null) => void;
  expandidoId: number | null;
  nuevosIndicadores: { [key: number]: string };
  setNuevosIndicadores: (v: { [key: number]: string }) => void;
  textosPlanes: { [key: number]: string };
  setTextosPlanes: (v: { [key: number]: string }) => void;
  diasPlanes: { [key: number]: number };
  setDiasPlanes: (v: { [key: number]: number }) => void;
  calcularGantt: (creado: string, limite: string) => any;
  planChatAbierto: number | null;
  setPlanChatAbierto: (id: number | null) => void;
  enviarComentario: (pid: number) => Promise<void>;
  nuevosComentarios: { [key: number]: string };
  setNuevosComentarios: (v: { [key: number]: string }) => void;
  actualizarDescripcionPuesto?: (eid: number, desc: string) => Promise<void>;
  guardarEvaluacionPotencial?: (eid: number, puntajeFinal: number, nivel: 1 | 2 | 3, justificacion: string, dimensiones: any) => Promise<void>;
  guardarFeedbackKPI?: (kpiId: number, eid: number, feedback: string) => Promise<void>;
  verPerfilCompleto?: (emp: Empleado) => void;
  // Solo Admin: abren los modales de edición y de desvinculación
  editarColaborador?: (emp: Empleado) => void;
  desvincularColaborador?: (emp: Empleado) => void;
}
