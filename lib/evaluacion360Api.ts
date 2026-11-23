// Cliente (navegador) de /api/evaluaciones: evaluación 360 por ciclos.
import { supabase } from './supabase'
import type { Ciclo, Competencia, Frecuencia, GrupoCompetencia, Informe, Relacion, ResultadoPulso } from './evaluacion360'
import type { FiltrosBI } from './bi'

export interface PersonaMin { id: number; nombre: string; puesto: string; area_id: number | null }

export interface RespuestaEv360 {
  permisos: { admin: boolean; auditor: boolean; miId: number | null };
  ciclos: Ciclo[];
  /** Ciclo consultado, con su cuestionario congelado */
  ciclo: Ciclo | null;
  /** Biblioteca de competencias (solo Admin) */
  biblioteca: Competencia[] | null;
  /** Evaluaciones que me toca responder en el ciclo */
  mias: { id: number; evaluado: PersonaMin; relacion: Relacion; estado: 'pendiente' | 'completada'; es_lider: boolean }[];
  /** Personas cuyos evaluadores gestiono (líder directo; Admin: todas) */
  nominacion: {
    participante_id: number; evaluado: PersonaMin; es_lider: boolean; lider_id: number | null;
    evaluadores: { asignacion_id: number; evaluador: PersonaMin; relacion: Relacion; estado: 'pendiente' | 'completada' }[];
  }[];
  /** Colaboradores activos que pueden nominarse como pares */
  candidatos: PersonaMin[];
  /** Avance de respuestas (Admin/Auditor: empresa por área; líder: su equipo) */
  avance: {
    total: number; completadas: number;
    porArea: { area: string; total: number; completadas: number }[];
    rezagados: { persona: PersonaMin; pendientes: number }[];
  } | null;
  /** Informes que puedo ver (desde la calibración) */
  informes: { participante_id: number; evaluado: PersonaMin; lider_id: number | null; es_lider: boolean; global: number | null; respuestas: number; conversado_en: string | null; calibrado: boolean }[];
  /** Calibración (Admin/Auditor) */
  calibracion: {
    distribucion: { sinDatos: number; tramos: { etiqueta: string; n: number }[] };
    sesgo: { general: number | null; evaluadores: { evaluador: PersonaMin; n: number; promedio: number; diferencia: number; alerta: boolean }[] };
  } | null;
  /** Pulso de seguimiento del ciclo (solo ciclos con resultados entregados) */
  pulso: { id: number; estado: 'abierto' | 'cerrado'; cierra_el: string | null; asignadas: number; completadas: number } | null;
  /** El Admin puede lanzar el pulso de este ciclo */
  puedeLanzarPulso: boolean;
  /** Pulsos que me toca responder */
  misPulsos: { id: number; evaluado: PersonaMin; relacion: Relacion; estado: 'pendiente' | 'completada'; competencias: { id: number; nombre: string }[] }[];
}

export interface Indicadores360 {
  ciclo: { id: number; nombre: string; estado: Ciclo['estado'] } | null;
  anterior: string | null;
  minimo: number;
  personas: number; conResultado: number; asignadas: number; completadas: number; conversados: number;
  global: number | null; variacion: number | null; brecha: number | null; conPuntoCiego: number | null;
  competencias: { nombre: string; promedio: number | null; n: number }[];
  correlacion: number | null;
  desarrollo: { conPlan: number; objetivos: number; logrados: number; acciones: number; accionesHechas: number; mezcla: Record<'experiencia' | 'relacion' | 'formacion', number>; checkinAlDia: number };
  pulso: { personas: number; delta: number | null; estado: 'abierto' | 'cerrado' } | null;
}

export interface DetalleInforme {
  participante_id: number;
  ciclo: { id: number; nombre: string; estado: Ciclo['estado'] };
  evaluado: PersonaMin;
  lider: PersonaMin | null;
  es_lider: boolean;
  informe: Informe;
  /** Pulso de seguimiento sobre las competencias de su PDI */
  pulso: ResultadoPulso | null;
  anterior: { ciclo: string; global: number | null } | null;
  conversado_en: string | null;
  conversado_por: string | null;
  acuerdos: string | null;
  reflexion: string | null;
  esPropio: boolean;
  permisos: { calibrar: boolean; conversar: boolean; reflexionar: boolean };
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada.');
  return session.access_token;
}

async function obtener<T>(query: string): Promise<T> {
  const res = await fetch(`/api/evaluaciones${query}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data as T;
}

export const cargarEv360 = (cicloId?: number | null) => obtener<RespuestaEv360>(cicloId ? `?ciclo=${cicloId}` : '');
export const cargarInforme = (participanteId: number) => obtener<DetalleInforme>(`?informe=${participanteId}`);
export function cargarIndicadores360(f: FiltrosBI) {
  const q = new URLSearchParams({ indicadores: '1' });
  if (f.areaId !== null) q.set('area', String(f.areaId));
  if (f.sede) q.set('sede', f.sede);
  if (f.contrato) q.set('contrato', f.contrato);
  return obtener<Indicadores360>(`?${q}`);
}

async function accion(cuerpo: Record<string, unknown>): Promise<{ id?: number; mensaje?: string }> {
  const res = await fetch('/api/evaluaciones', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data;
}

export interface DatosCiclo {
  id?: number; nombre: string; frecuencia: Frecuencia; periodo_desde: string; periodo_hasta: string;
  nominacion_hasta: string | null; evaluacion_hasta: string | null; calibracion_hasta: string | null;
  peso_lider: number; peso_pares: number; peso_colaboradores: number; minimo_anonimato: number;
}
export interface DatosCompetencia { id?: number; nombre: string; descripcion: string | null; grupo: GrupoCompetencia; activa: boolean; conductas: string[] }

export const cargarBibliotecaBase = () => accion({ accion: 'cargar_biblioteca_base' });
export const guardarCompetencia = (d: DatosCompetencia) => accion({ accion: 'guardar_competencia', ...d });
export const eliminarCompetencia = (id: number) => accion({ accion: 'eliminar_competencia', id });
export const guardarCiclo = (d: DatosCiclo) => accion({ accion: d.id ? 'editar_ciclo' : 'crear_ciclo', ...d });
export const eliminarCiclo = (id: number) => accion({ accion: 'eliminar_ciclo', id });
export const avanzarFase = (id: number) => accion({ accion: 'avanzar_fase', id });
export const reabrirEvaluacion = (id: number) => accion({ accion: 'reabrir_evaluacion', id });
export const excluirParticipante = (participante_id: number) => accion({ accion: 'excluir_participante', participante_id });
export const agregarPar = (participante_id: number, evaluador_id: number) => accion({ accion: 'agregar_par', participante_id, evaluador_id });
export const quitarPar = (asignacion_id: number) => accion({ accion: 'quitar_par', asignacion_id });
export const responderEvaluacion = (asignacion_id: number, respuestas: Record<number, number | null>, fortaleza: string, consejo: string) =>
  accion({ accion: 'responder', asignacion_id, respuestas, fortaleza, consejo });
export const calibrar = (participante_id: number, competencia_id: number, puntaje: number | null, justificacion: string) =>
  accion({ accion: 'calibrar', participante_id, competencia_id, puntaje, justificacion });
export const registrarConversacion = (participante_id: number, acuerdos: string) => accion({ accion: 'registrar_conversacion', participante_id, acuerdos });
export const guardarReflexion = (participante_id: number, reflexion: string) => accion({ accion: 'guardar_reflexion', participante_id, reflexion });
export const lanzarPulso = (ciclo_id: number, cierra_el: string | null) => accion({ accion: 'lanzar_pulso', ciclo_id, cierra_el });
export const cerrarPulso = (ciclo_id: number) => accion({ accion: 'cerrar_pulso', ciclo_id });
export const responderPulso = (asignacion_id: number, puntajes: Record<number, number | null>, comentario: string) =>
  accion({ accion: 'responder_pulso', asignacion_id, puntajes, comentario });
