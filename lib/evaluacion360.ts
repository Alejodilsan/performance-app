// Evaluación 360 por ciclos: tipos, biblioteca base, fases y consolidación de resultados con anonimato. Funciones puras
// (las usan /api/evaluaciones y el navegador).
import type { Area } from './tipos'

export type EstadoCiclo = 'borrador' | 'nominacion' | 'evaluacion' | 'calibracion' | 'resultados' | 'cerrado';
export type Frecuencia = 'semestral' | 'anual';
export type Relacion = 'auto' | 'lider' | 'par' | 'colaborador';
export type GrupoCompetencia = 'corporativa' | 'liderazgo';

export interface Conducta { id: number; texto: string; orden: number }
export interface Competencia {
  id: number; nombre: string; descripcion: string | null; grupo: GrupoCompetencia; activa: boolean; orden: number; conductas: Conducta[];
}
/** Competencia tal como queda congelada en el cuestionario de un ciclo */
export interface CompetenciaCuestionario { id: number; nombre: string; descripcion: string | null; grupo: GrupoCompetencia; conductas: { id: number; texto: string }[] }
export interface Cuestionario { competencias: CompetenciaCuestionario[] }

export interface Ciclo {
  id: number; nombre: string; frecuencia: Frecuencia; periodo_desde: string; periodo_hasta: string;
  nominacion_hasta: string | null; evaluacion_hasta: string | null; calibracion_hasta: string | null;
  estado: EstadoCiclo; peso_lider: number; peso_pares: number; peso_colaboradores: number; minimo_anonimato: number;
  cuestionario?: Cuestionario | null; lanzado_en: string | null;
}

export const FASES: { estado: EstadoCiclo; titulo: string; descripcion: string }[] = [
  { estado: 'borrador', titulo: 'Configuración', descripcion: 'El Admin define fechas, pesos y competencias del ciclo.' },
  { estado: 'nominacion', titulo: 'Nominación', descripcion: 'Cada líder elige los pares que evaluarán a su equipo.' },
  { estado: 'evaluacion', titulo: 'Evaluación', descripcion: 'Todos responden sus evaluaciones dentro de la ventana.' },
  { estado: 'calibracion', titulo: 'Calibración', descripcion: 'Admin y líderes revisan resultados y ajustan con justificación.' },
  { estado: 'resultados', titulo: 'Entrega', descripcion: 'Cada líder conversa los resultados 1:1; luego la persona ve su informe.' },
  { estado: 'cerrado', titulo: 'Cerrado', descripcion: 'El ciclo queda como histórico.' },
];

export const indiceFase = (e: EstadoCiclo) => FASES.findIndex(f => f.estado === e);
export const siguienteEstado = (e: EstadoCiclo): EstadoCiclo | null => FASES[indiceFase(e) + 1]?.estado ?? null;
/** El ciclo está en marcha (ya lanzado y no cerrado) */
export const enCurso = (e: EstadoCiclo) => e !== 'borrador' && e !== 'cerrado';
/** Ya hay resultados para revisar (calibración en adelante) */
export const conResultados = (e: EstadoCiclo) => indiceFase(e) >= indiceFase('calibracion');

export const RELACIONES: Record<Relacion, string> = {
  auto: 'Autoevaluación', lider: 'Líder directo', par: 'Par', colaborador: 'Colaborador',
};

/** Escala de frecuencia con anclas conductuales (además se puede responder "No he podido observarlo") */
export const ESCALA: { valor: number; titulo: string; descripcion: string }[] = [
  { valor: 1, titulo: 'Rara vez', descripcion: 'Rara vez lo demuestra; es una prioridad de desarrollo.' },
  { valor: 2, titulo: 'A veces', descripcion: 'Lo demuestra de forma ocasional o necesita apoyo.' },
  { valor: 3, titulo: 'Habitualmente', descripcion: 'Lo demuestra de forma consistente en su trabajo diario.' },
  { valor: 4, titulo: 'Casi siempre', descripcion: 'Lo demuestra incluso en situaciones exigentes o nuevas.' },
  { valor: 5, titulo: 'Es referente', descripcion: 'Lo demuestra siempre y lo impulsa en otros.' },
];

/** Biblioteca sugerida (editable por la empresa) */
export const BIBLIOTECA_BASE: { nombre: string; descripcion: string; grupo: GrupoCompetencia; conductas: string[] }[] = [
  { nombre: 'Orientación a resultados', grupo: 'corporativa', descripcion: 'Se compromete con metas exigentes y las cumple con calidad.', conductas: [
    'Cumple sus compromisos en los plazos acordados.',
    'Prioriza lo que más impacta los objetivos del área.',
    'Busca mejorar los resultados aunque ya cumpla la meta.',
  ] },
  { nombre: 'Colaboración y trabajo en equipo', grupo: 'corporativa', descripcion: 'Suma esfuerzos con otros para lograr objetivos comunes.', conductas: [
    'Comparte información y conocimiento de forma oportuna.',
    'Apoya a sus compañeros cuando lo necesitan, aun fuera de sus tareas.',
    'Construye acuerdos con otras áreas para lograr objetivos comunes.',
  ] },
  { nombre: 'Comunicación efectiva', grupo: 'corporativa', descripcion: 'Transmite y recibe información de forma clara y respetuosa.', conductas: [
    'Expresa sus ideas de forma clara y concreta.',
    'Escucha activamente y considera otros puntos de vista.',
    'Da y recibe retroalimentación de forma respetuosa y constructiva.',
  ] },
  { nombre: 'Orientación al cliente', grupo: 'corporativa', descripcion: 'Entiende y responde a las necesidades de clientes internos y externos.', conductas: [
    'Entiende las necesidades de sus clientes internos o externos.',
    'Responde a los requerimientos con oportunidad y calidad.',
    'Propone mejoras a partir de lo que el cliente necesita.',
  ] },
  { nombre: 'Aprendizaje y adaptabilidad', grupo: 'corporativa', descripcion: 'Aprende de forma continua y se ajusta a los cambios.', conductas: [
    'Se adapta con rapidez a cambios de prioridades o de contexto.',
    'Busca aprender cosas nuevas y aplicarlas en su trabajo.',
    'Reconoce sus errores y los convierte en aprendizaje.',
  ] },
  { nombre: 'Desarrollo de personas', grupo: 'liderazgo', descripcion: 'Hace crecer a su equipo.', conductas: [
    'Da retroalimentación frecuente y específica a su equipo.',
    'Delega retos que hacen crecer a las personas.',
    'Reconoce los logros de su equipo.',
  ] },
  { nombre: 'Dirección y claridad', grupo: 'liderazgo', descripcion: 'Da rumbo y hace seguimiento.', conductas: [
    'Comunica con claridad las prioridades y lo que espera de cada persona.',
    'Conecta el trabajo del equipo con los objetivos de la empresa.',
    'Hace seguimiento a los compromisos del equipo.',
  ] },
  { nombre: 'Toma de decisiones', grupo: 'liderazgo', descripcion: 'Decide con oportunidad y criterio.', conductas: [
    'Decide con oportunidad, aun con información incompleta.',
    'Considera el impacto de sus decisiones en las personas y los resultados.',
    'Asume la responsabilidad de sus decisiones.',
  ] },
  { nombre: 'Confianza e inspiración', grupo: 'liderazgo', descripcion: 'Genera confianza y moviliza al equipo.', conductas: [
    'Actúa con coherencia entre lo que dice y lo que hace.',
    'Genera un ambiente donde las personas se sienten seguras para opinar.',
    'Motiva al equipo en momentos de presión o cambio.',
  ] },
];

/** Cuestionario que aplica a una persona evaluada: las corporativas siempre, las de liderazgo solo si tiene equipo */
export const cuestionarioPara = (c: Cuestionario | null | undefined, esLider: boolean): CompetenciaCuestionario[] =>
  (c?.competencias ?? []).filter(k => k.grupo === 'corporativa' || esLider);

// ------------------------------------------------------------------ Fechas y ciclo sugerido

const dos = (n: number) => String(n).padStart(2, '0');
export const fechaISO = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Propuesta de corte según la frecuencia: el semestre o año en curso, con 1 semana de nominación y 2 de evaluación */
export function sugerirCiclo(frecuencia: Frecuencia, hoy = new Date()) {
  const anio = hoy.getFullYear();
  const segundo = hoy.getMonth() >= 6;
  const [desde, hasta] = frecuencia === 'anual' ? [`${anio}-01-01`, `${anio}-12-31`]
    : segundo ? [`${anio}-07-01`, `${anio}-12-31`] : [`${anio}-01-01`, `${anio}-06-30`];
  return {
    nombre: frecuencia === 'anual' ? `Evaluación 360 · ${anio}` : `Evaluación 360 · ${segundo ? '2.º' : '1.er'} semestre ${anio}`,
    frecuencia, periodo_desde: desde, periodo_hasta: hasta,
    nominacion_hasta: fechaISO(sumarDias(hoy, 7)), evaluacion_hasta: fechaISO(sumarDias(hoy, 21)), calibracion_hasta: fechaISO(sumarDias(hoy, 28)),
  };
}

/** Fecha límite de la fase actual del ciclo (si aplica) */
export function limiteDeFase(c: Pick<Ciclo, 'estado' | 'nominacion_hasta' | 'evaluacion_hasta' | 'calibracion_hasta'>): string | null {
  return c.estado === 'nominacion' ? c.nominacion_hasta : c.estado === 'evaluacion' ? c.evaluacion_hasta : c.estado === 'calibracion' ? c.calibracion_hasta : null;
}

/** Días que faltan hasta una fecha 'AAAA-MM-DD' (negativo = vencida) */
export function diasHasta(fecha: string, hoy = new Date()): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d).getTime();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((objetivo - base) / 86_400_000);
}

export function validarCiclo(c: { nombre?: string; periodo_desde?: string; periodo_hasta?: string; peso_lider?: number; peso_pares?: number; peso_colaboradores?: number; minimo_anonimato?: number }): string | null {
  if (!c.nombre?.trim()) return 'Ponle un nombre al ciclo.';
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!c.periodo_desde || !c.periodo_hasta || !fecha.test(c.periodo_desde) || !fecha.test(c.periodo_hasta)) return 'Indica el período evaluado.';
  if (c.periodo_hasta < c.periodo_desde) return 'El período termina antes de empezar.';
  const pesos = [c.peso_lider, c.peso_pares, c.peso_colaboradores].map(Number);
  if (pesos.some(p => !Number.isInteger(p) || p < 0 || p > 100)) return 'Los pesos deben ser enteros entre 0 y 100.';
  if (pesos.reduce((s, p) => s + p, 0) !== 100) return 'Los pesos de líder, pares y colaboradores deben sumar 100%.';
  const m = Number(c.minimo_anonimato);
  if (!Number.isInteger(m) || m < 2 || m > 10) return 'El mínimo para mostrar un grupo anónimo debe estar entre 2 y 10.';
  return null;
}

// ------------------------------------------------------------------ Participantes y asignaciones

interface EmpleadoMin { id: number; area_id: number | null; jefe_directo_id?: number | null }

/**
 * Líder directo para la 360: su jefe directo; si no tiene, el líder de su área; y si él mismo lidera su área,
 * el líder del área superior más cercana que tenga líder.
 */
export function liderDirectoDe(emp: EmpleadoMin, areas: Area[], activos: EmpleadoMin[]): number | null {
  const activosIds = new Set(activos.map(e => e.id));
  const valido = (id: number | null | undefined): id is number => !!id && id !== emp.id && activosIds.has(id);
  if (valido(emp.jefe_directo_id)) return emp.jefe_directo_id;
  const vistos = new Set<number>();
  let area = areas.find(a => a.id === emp.area_id);
  while (area && !vistos.has(area.id)) {
    vistos.add(area.id);
    if (valido(area.lider_id)) return area.lider_id;
    area = area.parent_id !== null ? areas.find(a => a.id === area!.parent_id) : undefined;
  }
  return null;
}

/** Asignaciones automáticas al lanzar: autoevaluación, el líder evalúa a cada reporte y cada reporte evalúa a su líder */
export function asignacionesAutomaticas(participantes: { evaluado_id: number; lider_id: number | null }[]) {
  const ids = new Set(participantes.map(p => p.evaluado_id));
  const filas: { evaluado_id: number; evaluador_id: number; relacion: Relacion }[] = [];
  participantes.forEach(p => {
    filas.push({ evaluado_id: p.evaluado_id, evaluador_id: p.evaluado_id, relacion: 'auto' });
    if (p.lider_id && ids.has(p.lider_id)) {
      filas.push({ evaluado_id: p.evaluado_id, evaluador_id: p.lider_id, relacion: 'lider' });
      filas.push({ evaluado_id: p.lider_id, evaluador_id: p.evaluado_id, relacion: 'colaborador' });
    }
  });
  // Sin duplicados (un mismo par evaluador–evaluado solo una vez)
  const vistos = new Set<string>();
  return filas.filter(f => { const k = `${f.evaluado_id}-${f.evaluador_id}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

export const PARES_RECOMENDADOS = { min: 2, max: 4 };

/** Valida una evaluación antes de enviarla */
export function validarRespuesta(items: CompetenciaCuestionario[], respuestas: Record<number, number | null | undefined>, fortaleza: string, consejo: string): string | null {
  const conductas = items.flatMap(c => c.conductas);
  if (conductas.length === 0) return 'Esta evaluación no tiene preguntas.';
  const faltan = conductas.filter(c => !(c.id in respuestas) || respuestas[c.id] === undefined);
  if (faltan.length) return `Faltan ${faltan.length} conducta(s) por responder (puedes marcar "No he podido observarlo").`;
  if (conductas.some(c => { const v = respuestas[c.id]; return v !== null && !(Number.isInteger(v) && v! >= 1 && v! <= 5); })) return 'Hay puntajes fuera de la escala.';
  const observadas = conductas.filter(c => respuestas[c.id] !== null).length;
  if (observadas < Math.ceil(conductas.length / 2)) return 'Marcaste más de la mitad como "no observado": si no conoces lo suficiente el trabajo de esta persona, avísale a su líder.';
  if (fortaleza.trim().length < 15) return 'Cuéntale qué debe seguir haciendo (al menos una frase concreta).';
  if (consejo.trim().length < 15) return 'Deja un consejo concreto para el próximo período (al menos una frase).';
  return null;
}

// ------------------------------------------------------------------ Consolidación del informe

export type ClaveGrupo = 'lider' | 'pares' | 'colaboradores' | 'otros';
export const ETIQUETA_GRUPO: Record<ClaveGrupo, string> = { lider: 'Líder', pares: 'Pares', colaboradores: 'Colaboradores', otros: 'Pares y colaboradores' };

export interface EvaluacionRecibida {
  relacion: Relacion;
  respuestas: Record<number, number | null>; // conducta_id → puntaje (null = no observado)
  fortaleza: string | null;
  consejo: string | null;
}
export type Cuadrante = 'fortaleza' | 'punto_ciego' | 'oculta' | 'oportunidad';
export const CUADRANTES: Record<Cuadrante, { titulo: string; descripcion: string }> = {
  fortaleza: { titulo: 'Fortalezas reconocidas', descripcion: 'Tú y los demás coinciden en que es una fortaleza.' },
  punto_ciego: { titulo: 'Puntos ciegos', descripcion: 'Te ves mejor de lo que te perciben: conversa ejemplos concretos.' },
  oculta: { titulo: 'Fortalezas ocultas', descripcion: 'Los demás te valoran más de lo que tú te ves.' },
  oportunidad: { titulo: 'Oportunidades de desarrollo', descripcion: 'Tú y los demás coinciden en que hay espacio para crecer.' },
};
/** Corte para considerar una competencia "alta" en la escala 1–5 */
export const CORTE_ALTO = 3.5;

export interface ResultadoCompetencia {
  id: number; nombre: string; grupo: GrupoCompetencia;
  auto: number | null;
  porGrupo: Partial<Record<ClaveGrupo, number | null>>;
  /** Promedio ponderado de las perspectivas visibles (sin autoevaluación) */
  otros: number | null;
  calibracion: { puntaje: number; justificacion: string } | null;
  /** Resultado final: el calibrado si existe, si no el ponderado */
  final: number | null;
  /** auto − final (positivo = se ve mejor de lo que lo ven) */
  brecha: number | null;
  cuadrante: Cuadrante | null;
}

export interface Informe {
  grupos: { clave: ClaveGrupo; n: number }[];
  /** Respuestas que no se muestran para proteger el anonimato */
  ocultas: number;
  competencias: ResultadoCompetencia[];
  global: number | null;
  autoGlobal: number | null;
  destacadas: { texto: string; competencia: string; promedio: number }[];
  aMejorar: { texto: string; competencia: string; promedio: number }[];
  comentarios: { origen: 'Autoevaluación' | 'Líder' | 'Pares y colaboradores'; fortaleza: string; consejo: string }[];
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/**
 * Consolida las evaluaciones completadas de una persona:
 *  - Cada grupo anónimo (pares, colaboradores) se muestra solo con `minimo` respuestas o más; los que no llegan se
 *    juntan en "Pares y colaboradores" y, si aun así no llegan, se excluyen del resultado (no se pueden inferir).
 *  - El resultado de una competencia es el promedio ponderado de las perspectivas visibles (pesos del ciclo,
 *    renormalizados a las que tienen datos); la autoevaluación no suma y se compara aparte (brecha).
 */
export function consolidar(
  items: CompetenciaCuestionario[],
  recibidas: EvaluacionRecibida[],
  pesos: { lider: number; pares: number; colaboradores: number },
  minimo: number,
  calibraciones: Record<number, { puntaje: number; justificacion: string }> = {},
): Informe {
  const auto = recibidas.filter(r => r.relacion === 'auto');
  const lider = recibidas.filter(r => r.relacion === 'lider');
  const pares = recibidas.filter(r => r.relacion === 'par');
  const colaboradores = recibidas.filter(r => r.relacion === 'colaborador');

  const grupos: { clave: ClaveGrupo; evals: EvaluacionRecibida[]; peso: number }[] = [];
  if (lider.length) grupos.push({ clave: 'lider', evals: lider, peso: pesos.lider });
  const pendientes: { evals: EvaluacionRecibida[]; peso: number }[] = [];
  ([['pares', pares, pesos.pares], ['colaboradores', colaboradores, pesos.colaboradores]] as const).forEach(([clave, evals, peso]) => {
    if (evals.length === 0) return;
    if (evals.length >= minimo) grupos.push({ clave, evals: [...evals], peso });
    else pendientes.push({ evals: [...evals], peso });
  });
  let ocultas = 0;
  if (pendientes.length) {
    const juntas = pendientes.flatMap(p => p.evals);
    if (juntas.length >= minimo) grupos.push({ clave: 'otros', evals: juntas, peso: pendientes.reduce((s, p) => s + p.peso, 0) });
    else ocultas = juntas.length;
  }

  /** Promedio por evaluador de un conjunto de conductas (sin "no observado"); luego promedio entre evaluadores */
  const promedioGrupo = (evals: EvaluacionRecibida[], conductas: number[]) =>
    media(evals.map(ev => media(conductas.map(id => ev.respuestas[id]).filter((v): v is number => typeof v === 'number'))).filter((v): v is number => v !== null));
  const ponderado = (conductas: number[]) => {
    let suma = 0, pesoTotal = 0;
    grupos.forEach(g => {
      const p = promedioGrupo(g.evals, conductas);
      if (p === null) return;
      const w = g.peso > 0 ? g.peso : 0;
      suma += p * w; pesoTotal += w;
    });
    if (pesoTotal === 0) {
      // Todos los pesos visibles en 0: promedio simple de los grupos
      const v = grupos.map(g => promedioGrupo(g.evals, conductas)).filter((x): x is number => x !== null);
      return v.length ? media(v) : null;
    }
    return suma / pesoTotal;
  };

  const competencias: ResultadoCompetencia[] = items.map(c => {
    const ids = c.conductas.map(x => x.id);
    const a = promedioGrupo(auto, ids);
    const o = ponderado(ids);
    const cal = calibraciones[c.id] ?? null;
    const final = cal ? cal.puntaje : o;
    const porGrupo: ResultadoCompetencia['porGrupo'] = {};
    grupos.forEach(g => { const p = promedioGrupo(g.evals, ids); porGrupo[g.clave] = p === null ? null : redondear(p); });
    const cuadrante: Cuadrante | null = a === null || final === null ? null
      : a >= CORTE_ALTO ? (final >= CORTE_ALTO ? 'fortaleza' : 'punto_ciego') : (final >= CORTE_ALTO ? 'oculta' : 'oportunidad');
    return {
      id: c.id, nombre: c.nombre, grupo: c.grupo,
      auto: a === null ? null : redondear(a), porGrupo, otros: o === null ? null : redondear(o),
      calibracion: cal, final: final === null ? null : redondear(final),
      brecha: a === null || final === null ? null : redondear(a - final), cuadrante,
    };
  });

  const conductas = items.flatMap(c => c.conductas.map(x => ({ ...x, competencia: c.nombre })))
    .map(x => ({ texto: x.texto, competencia: x.competencia, p: ponderado([x.id]) }))
    .filter((x): x is { texto: string; competencia: string; p: number } => x.p !== null)
    .map(x => ({ texto: x.texto, competencia: x.competencia, promedio: redondear(x.p) }));
  const ordenadas = [...conductas].sort((a, b) => b.promedio - a.promedio || a.texto.localeCompare(b.texto, 'es'));

  const finales = competencias.map(c => c.final).filter((x): x is number => x !== null);
  const autos = competencias.map(c => c.auto).filter((x): x is number => x !== null);

  // Comentarios: los anónimos solo de grupos visibles, mezclados y en orden alfabético (el orden no delata a nadie)
  const texto = (v: string | null) => (v || '').trim();
  const anonimos = grupos.filter(g => g.clave !== 'lider').flatMap(g => g.evals)
    .map(ev => ({ origen: 'Pares y colaboradores' as const, fortaleza: texto(ev.fortaleza), consejo: texto(ev.consejo) }))
    .sort((a, b) => a.fortaleza.localeCompare(b.fortaleza, 'es'));
  const comentarios: Informe['comentarios'] = [
    ...lider.map(ev => ({ origen: 'Líder' as const, fortaleza: texto(ev.fortaleza), consejo: texto(ev.consejo) })),
    ...anonimos,
    ...auto.map(ev => ({ origen: 'Autoevaluación' as const, fortaleza: texto(ev.fortaleza), consejo: texto(ev.consejo) })),
  ].filter(c => c.fortaleza || c.consejo);

  return {
    grupos: grupos.map(g => ({ clave: g.clave, n: g.evals.length })),
    ocultas,
    competencias,
    global: finales.length ? redondear(media(finales)!) : null,
    autoGlobal: autos.length ? redondear(media(autos)!) : null,
    destacadas: ordenadas.slice(0, 3),
    aMejorar: ordenadas.length > 3 ? ordenadas.slice(-3).reverse() : [],
    comentarios,
  };
}

/**
 * Tendencia de cada evaluador (calibración): promedio que asigna frente al promedio de la empresa.
 * Solo evaluadores con 3 o más evaluaciones; `alerta` si se aleja 0,6 puntos o más (muy benévolo o muy exigente).
 */
export function sesgoEvaluadores(evaluaciones: { evaluador_id: number; relacion: Relacion; respuestas: Record<number, number | null> }[]) {
  const porEvaluador = new Map<number, number[]>();
  const todas: number[] = [];
  evaluaciones.filter(e => e.relacion !== 'auto').forEach(e => {
    const p = media(Object.values(e.respuestas).filter((v): v is number => typeof v === 'number'));
    if (p === null) return;
    todas.push(p);
    porEvaluador.set(e.evaluador_id, [...(porEvaluador.get(e.evaluador_id) ?? []), p]);
  });
  const general = media(todas);
  if (general === null) return { general: null, evaluadores: [] };
  return {
    general: redondear(general),
    evaluadores: [...porEvaluador.entries()].filter(([, v]) => v.length >= 3).map(([id, v]) => {
      const p = media(v)!;
      return { evaluador_id: id, n: v.length, promedio: redondear(p), diferencia: redondear(p - general), alerta: Math.abs(p - general) >= 0.6 };
    }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
  };
}

/** Distribución de resultados globales en tramos de la escala (para la calibración) */
export function distribucion(globales: (number | null)[]) {
  const tramos = [
    { desde: 1, hasta: 2, etiqueta: '1 – 2' }, { desde: 2, hasta: 3, etiqueta: '2 – 3' },
    { desde: 3, hasta: 3.5, etiqueta: '3 – 3,5' }, { desde: 3.5, hasta: 4, etiqueta: '3,5 – 4' },
    { desde: 4, hasta: 4.5, etiqueta: '4 – 4,5' }, { desde: 4.5, hasta: 5.01, etiqueta: '4,5 – 5' },
  ];
  const v = globales.filter((x): x is number => x !== null);
  return { sinDatos: globales.length - v.length, tramos: tramos.map(t => ({ etiqueta: t.etiqueta, n: v.filter(x => x >= t.desde && x < t.hasta).length })) };
}

export const formatoPuntaje = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1).replace('.', ','));

// ------------------------------------------------------------------ Pulso de seguimiento (mitad de ciclo)

export interface RespuestaPulso { relacion: Relacion; puntajes: Record<number, number | null>; comentario: string | null }
export interface ResultadoPulso {
  /** Respuestas de otras personas (sin la autoevaluación) */
  respondieron: number;
  /** 'grupo' = promedio de todos los evaluadores (anonimato cumplido); 'lider' = solo el líder (no anónimo) */
  fuente: 'grupo' | 'lider' | null;
  competencias: { id: number; nombre: string; base: number | null; pulso: number | null; auto: number | null; delta: number | null }[];
  comentarios: { origen: 'Líder' | 'Evaluadores' | 'Autoevaluación'; texto: string }[];
}

/**
 * Consolida un pulso: compara cómo ven hoy cada competencia del PDI con el resultado del ciclo (base).
 * Los evaluadores se promedian juntos solo si son `minimo` o más; si no, se muestra únicamente al líder.
 */
export function consolidarPulso(base: { id: number; nombre: string; final: number | null }[], respuestas: RespuestaPulso[], minimo: number): ResultadoPulso {
  const otros = respuestas.filter(r => r.relacion !== 'auto');
  const lider = otros.filter(r => r.relacion === 'lider');
  const auto = respuestas.filter(r => r.relacion === 'auto');
  const fuente: ResultadoPulso['fuente'] = otros.length >= minimo ? 'grupo' : lider.length ? 'lider' : null;
  const usados = fuente === 'grupo' ? otros : fuente === 'lider' ? lider : [];
  const prom = (rs: RespuestaPulso[], id: number) => media(rs.map(r => r.puntajes[id]).filter((v): v is number => typeof v === 'number'));
  const texto = (v: string | null) => (v || '').trim();
  return {
    respondieron: otros.length,
    fuente,
    competencias: base.map(c => {
      const p = prom(usados, c.id);
      const a = prom(auto, c.id);
      return { id: c.id, nombre: c.nombre, base: c.final, pulso: p === null ? null : redondear(p), auto: a === null ? null : redondear(a), delta: p === null || c.final === null ? null : redondear(p - c.final) };
    }),
    comentarios: [
      ...lider.map(r => ({ origen: 'Líder' as const, texto: texto(r.comentario) })),
      ...(fuente === 'grupo' ? otros.filter(r => r.relacion !== 'lider').map(r => ({ origen: 'Evaluadores' as const, texto: texto(r.comentario) })).sort((a, b) => a.texto.localeCompare(b.texto, 'es')) : []),
      ...auto.map(r => ({ origen: 'Autoevaluación' as const, texto: texto(r.comentario) })),
    ].filter(c => c.texto),
  };
}

// ------------------------------------------------------------------ Indicadores agregados (BI)

export interface PersonaIndicador {
  informe: Informe | null;
  anterior: number | null;
  cumplimiento: number | null;
  conversado: boolean;
  asignadas: number;
  completadas: number;
}

/**
 * Agrega los resultados de una población. Los promedios solo se informan con `minimo` personas o más
 * (con menos, un promedio podría revelar el resultado de alguien).
 */
export function agregarIndicadores(personas: PersonaIndicador[], minimo: number) {
  const conInforme = personas.filter(p => p.informe?.global != null);
  const promedioSi = (v: number[]) => (v.length >= minimo ? redondear(media(v)!) : null);
  const globales = conInforme.map(p => p.informe!.global!);
  const ambos = conInforme.filter(p => p.anterior !== null);
  const porCompetencia = new Map<string, number[]>();
  conInforme.forEach(p => p.informe!.competencias.forEach(c => { if (c.final !== null) porCompetencia.set(c.nombre, [...(porCompetencia.get(c.nombre) ?? []), c.final]); }));
  const brechas = conInforme.filter(p => p.informe!.autoGlobal !== null).map(p => p.informe!.autoGlobal! - p.informe!.global!);
  return {
    personas: personas.length,
    conResultado: conInforme.length,
    asignadas: personas.reduce((s, p) => s + p.asignadas, 0),
    completadas: personas.reduce((s, p) => s + p.completadas, 0),
    conversados: personas.filter(p => p.conversado).length,
    global: promedioSi(globales),
    variacion: ambos.length >= minimo ? redondear(media(ambos.map(p => p.informe!.global! - p.anterior!))!) : null,
    competencias: [...porCompetencia.entries()].map(([nombre, v]) => ({ nombre, promedio: promedioSi(v), n: v.length }))
      .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1)),
    brecha: promedioSi(brechas),
    conPuntoCiego: conInforme.length >= minimo ? conInforme.filter(p => p.informe!.competencias.some(c => c.cuadrante === 'punto_ciego')).length : null,
    /** Pares (360, cumplimiento KPI) para la correlación; solo se envían agregados */
    pares: conInforme.filter(p => p.cumplimiento !== null).map(p => [p.informe!.global!, p.cumplimiento!] as [number, number]),
  };
}
