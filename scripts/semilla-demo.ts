// Carga una organización FICTICIA completa en una empresa de demostración (para demos y capturas comerciales):
// estructura, cargos y salarios, KPIs con 5 meses de resultados y cierres oficiales, OKR, potencial, planes de mejora,
// dos ciclos 360 (uno cerrado y otro en entrega) y planes de desarrollo con check-ins.
//   npm run semilla-demo -- --empresa 4
// Solo funciona sobre una empresa que tenga, como mucho, a su Admin (no toca empresas con datos reales).
import { crearClienteAdmin } from '@/lib/servidor/supabaseAdmin'
import { recalcularCumplimiento, refrescarKpiVigente } from '@/lib/servidor/cumplimiento'
import { calcularProgreso, claveMes, etiquetaMes, pesosEfectivos, promedioPonderado, sumarMeses } from '@/lib/periodos'
import { asignacionesAutomaticas, liderDirectoDe, type Cuestionario } from '@/lib/evaluacion360'
import type { SupabaseClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local');
const admin: SupabaseClient = crearClienteAdmin();
const arg = (k: string) => { const a = process.argv; const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const EMPRESA = Number(arg('empresa'));

// Pseudoaleatorio determinista (siempre los mismos datos)
let semilla = 20261124;
const azar = () => { semilla |= 0; semilla = (semilla + 0x6D2B79F5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const entre = (a: number, b: number) => a + azar() * (b - a);
const elegir = <T,>(xs: T[]) => xs[Math.floor(azar() * xs.length)];

function ok<T>(r: { data: T; error: { message: string } | null }, paso: string): T {
  if (r.error) throw new Error(`${paso}: ${r.error.message}`);
  return r.data;
}

// ------------------------------------------------------------------ Organización
type Perfil = 'alto' | 'medio' | 'bajo';
interface Persona { clave: string; nombre: string; cargo: string; nivel: string; area: string; lider?: boolean; salario: number; perfil: Perfil; potencial: 1 | 2 | 3 | null; sede: string; ingreso: string; meses_sin_ajuste?: number }

const AREAS: { clave: string; nombre: string; padre?: string }[] = [
  { clave: 'gg', nombre: 'Gerencia General' },
  { clave: 'com', nombre: 'Comercial', padre: 'gg' },
  { clave: 'ven', nombre: 'Ventas Corporativas', padre: 'com' },
  { clave: 'mer', nombre: 'Mercadeo', padre: 'com' },
  { clave: 'ope', nombre: 'Operaciones', padre: 'gg' },
  { clave: 'log', nombre: 'Logística', padre: 'ope' },
  { clave: 'ser', nombre: 'Servicio al Cliente', padre: 'ope' },
  { clave: 'th', nombre: 'Talento Humano', padre: 'gg' },
  { clave: 'fin', nombre: 'Finanzas', padre: 'gg' },
];

const PERSONAS: Persona[] = [
  { clave: 'andres', nombre: 'Andrés Restrepo', cargo: 'Gerente General', nivel: 'Dirección', area: 'gg', lider: true, salario: 28_000_000, perfil: 'alto', potencial: 3, sede: 'Bogotá', ingreso: '2017-02-01' },
  { clave: 'camila', nombre: 'Camila Ortiz', cargo: 'Gerente Comercial', nivel: 'Gerencia', area: 'com', lider: true, salario: 17_500_000, perfil: 'alto', potencial: 3, sede: 'Bogotá', ingreso: '2019-05-13' },
  { clave: 'julian', nombre: 'Julián Vargas', cargo: 'Jefe de Ventas', nivel: 'Jefatura', area: 'ven', lider: true, salario: 9_200_000, perfil: 'alto', potencial: 2, sede: 'Bogotá', ingreso: '2020-08-03' },
  { clave: 'sofia', nombre: 'Sofía Herrera', cargo: 'Ejecutiva de Cuenta', nivel: 'Profesional', area: 'ven', salario: 5_200_000, perfil: 'alto', potencial: 3, sede: 'Bogotá', ingreso: '2021-03-15', meses_sin_ajuste: 26 },
  { clave: 'mateo', nombre: 'Mateo Ríos', cargo: 'Ejecutivo de Cuenta', nivel: 'Profesional', area: 'ven', salario: 4_900_000, perfil: 'medio', potencial: 2, sede: 'Bogotá', ingreso: '2022-01-10' },
  { clave: 'valentina', nombre: 'Valentina Cruz', cargo: 'Ejecutiva de Cuenta', nivel: 'Profesional', area: 'ven', salario: 4_700_000, perfil: 'bajo', potencial: 2, sede: 'Medellín', ingreso: '2024-06-04' },
  { clave: 'daniela', nombre: 'Daniela Castro', cargo: 'Jefe de Mercadeo', nivel: 'Jefatura', area: 'mer', lider: true, salario: 8_600_000, perfil: 'medio', potencial: 2, sede: 'Bogotá', ingreso: '2021-09-20' },
  { clave: 'santiago', nombre: 'Santiago Morales', cargo: 'Analista de Mercadeo', nivel: 'Profesional', area: 'mer', salario: 4_300_000, perfil: 'alto', potencial: 2, sede: 'Bogotá', ingreso: '2023-02-06' },
  { clave: 'isabella', nombre: 'Isabella Rojas', cargo: 'Diseñadora Gráfica', nivel: 'Técnico', area: 'mer', salario: 3_400_000, perfil: 'medio', potencial: 1, sede: 'Bogotá', ingreso: '2023-07-17' },
  { clave: 'felipe', nombre: 'Felipe Guzmán', cargo: 'Gerente de Operaciones', nivel: 'Gerencia', area: 'ope', lider: true, salario: 16_800_000, perfil: 'medio', potencial: 2, sede: 'Medellín', ingreso: '2018-11-05' },
  { clave: 'natalia', nombre: 'Natalia Peña', cargo: 'Jefe de Logística', nivel: 'Jefatura', area: 'log', lider: true, salario: 8_900_000, perfil: 'alto', potencial: 3, sede: 'Medellín', ingreso: '2020-02-17' },
  { clave: 'carlos', nombre: 'Carlos Ramírez', cargo: 'Coordinador de Despacho', nivel: 'Coordinación', area: 'log', salario: 3_700_000, perfil: 'medio', potencial: 2, sede: 'Medellín', ingreso: '2019-04-08', meses_sin_ajuste: 31 },
  { clave: 'juliana', nombre: 'Juliana Torres', cargo: 'Auxiliar Logístico', nivel: 'Operativo', area: 'log', salario: 1_950_000, perfil: 'alto', potencial: 1, sede: 'Medellín', ingreso: '2022-10-03' },
  { clave: 'diego', nombre: 'Diego Salazar', cargo: 'Auxiliar Logístico', nivel: 'Operativo', area: 'log', salario: 1_850_000, perfil: 'bajo', potencial: 1, sede: 'Medellín', ingreso: '2025-01-13' },
  { clave: 'paula', nombre: 'Paula Jiménez', cargo: 'Jefe de Servicio al Cliente', nivel: 'Jefatura', area: 'ser', lider: true, salario: 8_400_000, perfil: 'medio', potencial: 2, sede: 'Bogotá', ingreso: '2021-06-01' },
  { clave: 'tomas', nombre: 'Tomás Medina', cargo: 'Agente de Servicio', nivel: 'Operativo', area: 'ser', salario: 2_150_000, perfil: 'alto', potencial: 2, sede: 'Bogotá', ingreso: '2023-04-10' },
  { clave: 'mariana', nombre: 'Mariana López', cargo: 'Agente de Servicio', nivel: 'Operativo', area: 'ser', salario: 2_100_000, perfil: 'medio', potencial: null, sede: 'Bogotá', ingreso: '2025-08-19' },
  { clave: 'samuel', nombre: 'Samuel Díaz', cargo: 'Agente de Servicio', nivel: 'Operativo', area: 'ser', salario: 2_050_000, perfil: 'bajo', potencial: 1, sede: 'Bogotá', ingreso: '2024-02-26' },
  { clave: 'laura', nombre: 'Laura Méndez', cargo: 'Directora de Talento Humano', nivel: 'Dirección', area: 'th', lider: true, salario: 14_500_000, perfil: 'alto', potencial: 3, sede: 'Bogotá', ingreso: '2018-03-12' },
  { clave: 'gabriela', nombre: 'Gabriela Navarro', cargo: 'Analista de Talento', nivel: 'Profesional', area: 'th', salario: 4_400_000, perfil: 'alto', potencial: 2, sede: 'Bogotá', ingreso: '2022-05-09' },
  { clave: 'esteban', nombre: 'Esteban Pardo', cargo: 'Analista de Nómina', nivel: 'Profesional', area: 'th', salario: 4_100_000, perfil: 'medio', potencial: null, sede: 'Bogotá', ingreso: '2023-11-14' },
  { clave: 'ricardo', nombre: 'Ricardo Silva', cargo: 'Director Financiero', nivel: 'Dirección', area: 'fin', lider: true, salario: 15_200_000, perfil: 'medio', potencial: 2, sede: 'Bogotá', ingreso: '2019-01-21' },
  { clave: 'anamaria', nombre: 'Ana María Vélez', cargo: 'Contadora', nivel: 'Profesional', area: 'fin', salario: 5_600_000, perfil: 'alto', potencial: 2, sede: 'Bogotá', ingreso: '2020-07-06' },
  { clave: 'luisf', nombre: 'Luis Fernando Ospina', cargo: 'Analista Financiero', nivel: 'Profesional', area: 'fin', salario: 4_500_000, perfil: 'bajo', potencial: 2, sede: 'Bogotá', ingreso: '2024-09-02' },
];

// KPIs por cargo: [título, unidad, meta, dirección, peso]
type DefKpi = [string, string, number, 'creciente' | 'decreciente', number, string?];
const KPIS: Record<string, DefKpi[]> = {
  'Gerente General': [['EBITDA del mes', 'M COP', 620, 'creciente', 60], ['Clima laboral', '%', 80, 'creciente', 40]],
  'Gerente Comercial': [['Ventas totales del mes', 'M COP', 3900, 'creciente', 70, 'ventas'], ['Clientes nuevos', 'clientes', 12, 'creciente', 30]],
  'Jefe de Ventas': [['Ventas corporativas del mes', 'M COP', 2600, 'creciente', 70, 'ventasCorp'], ['Propuestas enviadas', 'propuestas', 30, 'creciente', 30]],
  'Ejecutiva de Cuenta': [['Ventas del mes', 'M COP', 850, 'creciente', 70, 'ventasCorp'], ['Visitas a clientes', 'visitas', 20, 'creciente', 30]],
  'Ejecutivo de Cuenta': [['Ventas del mes', 'M COP', 850, 'creciente', 70, 'ventasCorp'], ['Visitas a clientes', 'visitas', 20, 'creciente', 30]],
  'Jefe de Mercadeo': [['Leads calificados', 'leads', 180, 'creciente', 60, 'ventas'], ['Costo por lead', 'miles COP', 45, 'decreciente', 40]],
  'Analista de Mercadeo': [['Leads generados', 'leads', 250, 'creciente', 60], ['Tasa de conversión de campañas', '%', 4, 'creciente', 40]],
  'Diseñadora Gráfica': [['Piezas entregadas a tiempo', '%', 95, 'creciente', 100]],
  'Gerente de Operaciones': [['Costo logístico sobre ventas', '%', 7.5, 'decreciente', 50], ['Entregas a tiempo', '%', 96, 'creciente', 50, 'entregas']],
  'Jefe de Logística': [['Entregas a tiempo', '%', 96, 'creciente', 60, 'entregas'], ['Devoluciones por error', '%', 1.5, 'decreciente', 40]],
  'Coordinador de Despacho': [['Despachos sin novedad', '%', 97, 'creciente', 100, 'entregas']],
  'Auxiliar Logístico': [['Pedidos alistados por día', 'pedidos', 60, 'creciente', 60], ['Errores de alistamiento', 'errores', 3, 'decreciente', 40, 'entregas']],
  'Jefe de Servicio al Cliente': [['NPS de clientes', 'puntos', 60, 'creciente', 60, 'nps'], ['Resolución al primer contacto', '%', 80, 'creciente', 40, 'primerContacto']],
  'Agente de Servicio': [['Casos resueltos al primer contacto', '%', 80, 'creciente', 60, 'primerContacto'], ['Satisfacción por caso', 'puntos (1–5)', 4.5, 'creciente', 40, 'nps']],
  'Directora de Talento Humano': [['Rotación voluntaria', '%', 1.2, 'decreciente', 50], ['Vacantes cubiertas a tiempo', '%', 85, 'creciente', 50]],
  'Analista de Talento': [['Tiempo promedio de contratación', 'días', 30, 'decreciente', 60], ['Planes de desarrollo con seguimiento', '%', 90, 'creciente', 40]],
  'Analista de Nómina': [['Nómina pagada sin novedades', '%', 99, 'creciente', 100]],
  'Director Financiero': [['Margen bruto', '%', 32, 'creciente', 60], ['Días de cartera', 'días', 45, 'decreciente', 40]],
  'Contadora': [['Cierre contable a tiempo', 'días hábiles', 5, 'decreciente', 100]],
  'Analista Financiero': [['Informes entregados a tiempo', '%', 95, 'creciente', 60], ['Precisión del presupuesto', '%', 95, 'creciente', 40]],
};

const PROGRESO: Record<Perfil, [number, number]> = { alto: [0.9, 1.08], medio: [0.72, 0.92], bajo: [0.5, 0.72] };
/** Resultado de un mes para lograr (aprox.) un progreso objetivo, según la dirección del KPI */
function resultadoPara(meta: number, dir: 'creciente' | 'decreciente', factor: number) {
  const r = dir === 'creciente' ? meta * factor : meta / Math.max(factor, 0.3);
  const decimales = meta < 10 ? 1 : 0;
  return Number(r.toFixed(decimales));
}

async function main() {
  if (!EMPRESA) throw new Error('Indica la empresa: npm run semilla-demo -- --empresa <id>');
  const { data: empresa } = await admin.from('empresas').select('id, nombre').eq('id', EMPRESA).single();
  if (!empresa) throw new Error('La empresa no existe.');
  const { data: existentes } = await admin.from('empleados').select('id, nombre, email, user_id').eq('empresa_id', EMPRESA);
  if ((existentes || []).length > 1) throw new Error(`La empresa "${empresa.nombre}" ya tiene ${existentes!.length} colaboradores: la semilla solo se carga en una empresa vacía.`);
  const adminEmp = existentes?.[0];
  console.log(`Cargando datos ficticios en "${empresa.nombre}" (id ${EMPRESA})…`);

  // Niveles
  const { data: niveles } = await admin.from('niveles_cargo').select('id, nombre').eq('empresa_id', EMPRESA);
  const nivelId = (n: string) => niveles!.find(x => x.nombre === n)?.id ?? null;

  // Áreas (primero sin padre, luego padres)
  const areaId: Record<string, number> = {};
  for (const a of AREAS) {
    const fila = ok(await admin.from('areas').insert({ nombre: a.nombre, empresa_id: EMPRESA }).select('id').single(), `Área ${a.nombre}`);
    areaId[a.clave] = fila!.id;
  }
  for (const a of AREAS.filter(x => x.padre)) ok(await admin.from('areas').update({ parent_id: areaId[a.padre!] }).eq('id', areaId[a.clave]), 'Padre de área');

  // Cargos (uno por cargo y área) con rango salarial
  const puestoId: Record<string, number> = {};
  for (const p of PERSONAS) {
    const k = `${p.area}|${p.cargo}`;
    if (puestoId[k]) continue;
    const fila = ok(await admin.from('puestos').insert({ nombre: p.cargo, empresa_id: EMPRESA, area_id: areaId[p.area], nivel_id: nivelId(p.nivel), descripcion: `Cargo de ${p.nivel.toLowerCase()} del área.` }).select('id').single(), `Cargo ${p.cargo}`);
    puestoId[k] = fila!.id;
    const base = p.salario;
    ok(await admin.from('rangos_salariales_cargo').upsert({ puesto_id: fila!.id, empresa_id: EMPRESA, salario_min: Math.round(base * 0.85 / 100000) * 100000, salario_max: Math.round(base * 1.2 / 100000) * 100000, moneda: 'COP', updated_at: new Date().toISOString() }), 'Rango salarial');
  }

  // Colaboradores
  const empId: Record<string, number> = {};
  const correo = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ').slice(0, 2).join('.') + '@andinademo.example';
  for (const p of PERSONAS) {
    const datos = {
      nombre: p.nombre, puesto: p.cargo, puesto_id: puestoId[`${p.area}|${p.cargo}`], area_id: areaId[p.area], empresa_id: EMPRESA,
      tipo_perfil: p.clave === 'laura' ? 'Admin' : p.lider ? (p.nivel === 'Jefatura' ? 'Líder de Área' : 'Manager') : 'Empleado',
      estado_contratacion: 'activo', sede: p.sede, fecha_ingreso: p.ingreso, tipo_contrato: p.nivel === 'Operativo' && p.clave === 'diego' ? 'fijo' : 'indefinido',
      modalidad: p.area === 'log' || p.area === 'ser' ? 'presencial' : 'hibrido', jornada: 'completa', potencial_score: p.potencial,
    };
    if (p.clave === 'laura' && adminEmp) {
      ok(await admin.from('empleados').update(datos).eq('id', adminEmp.id), 'Admin');
      empId[p.clave] = adminEmp.id;
    } else {
      const fila = ok(await admin.from('empleados').insert({ ...datos, email: correo(p.nombre), estado_acceso: 'sin_invitar' }).select('id').single(), `Colaborador ${p.nombre}`);
      empId[p.clave] = fila!.id;
    }
  }
  // Líderes de área
  for (const p of PERSONAS.filter(x => x.lider)) ok(await admin.from('areas').update({ lider_id: empId[p.clave] }).eq('id', areaId[p.area]), 'Líder de área');

  // Salarios (historial: ingreso y último ajuste)
  for (const p of PERSONAS) {
    const ajuste = sumarMeses('2026-11', -(p.meses_sin_ajuste ?? Math.round(entre(2, 11))));
    await admin.from('compensaciones').insert([
      { empleado_id: empId[p.clave], empresa_id: EMPRESA, salario: Math.round(p.salario * 0.9 / 10000) * 10000, moneda: 'COP', periodicidad: 'mensual', fecha_vigencia: p.ingreso, motivo: 'Salario de ingreso' },
      { empleado_id: empId[p.clave], empresa_id: EMPRESA, salario: p.salario, moneda: 'COP', periodicidad: 'mensual', fecha_vigencia: `${ajuste}-01`, motivo: 'Ajuste salarial' },
    ].filter((f, i) => i === 1 || f.fecha_vigencia < `${ajuste}-01`));
  }

  // Potencial (Nine Box)
  for (const p of PERSONAS.filter(x => x.potencial)) {
    const puntaje = p.potencial === 3 ? entre(3.9, 4.6) : p.potencial === 2 ? entre(2.7, 3.6) : entre(1.8, 2.4);
    ok(await admin.from('evaluaciones_potencial').insert({ empleado_id: empId[p.clave], evaluador_id: empId.laura, scores_dimensiones: [], puntaje_obtenido: Number(puntaje.toFixed(2)), nivel_resultado: p.potencial, justificacion: 'Evaluación de potencial del comité de talento (datos de demostración).' }), 'Potencial');
  }

  // ---------------- OKR 2026 (T4)
  const okr = async (titulo: string, area: string | null, krPadre: number | null, responsable: string) =>
    ok(await admin.from('okr_objetivos').insert({ empresa_id: EMPRESA, area_id: area ? areaId[area] : null, anio: 2026, titulo, kr_padre_id: krPadre, responsable_id: empId[responsable] }).select('id').single(), titulo)!.id as number;
  const kr = async (objetivo: number, titulo: string, medido?: { meta: number; valor: number; unidad: string; inicial?: number }) =>
    ok(await admin.from('okr_resultados_clave').insert({
      objetivo_id: objetivo, empresa_id: EMPRESA, titulo, trimestre: 4, tipo_medicion: medido ? 'medido' : 'calculado',
      meta: medido?.meta ?? null, resultado_actual: medido?.valor ?? null, valor_inicial: medido?.inicial ?? 0, unidad: medido?.unidad ?? null,
      actualizado_en: medido ? new Date().toISOString() : null,
    }).select('id').single(), titulo)!.id as number;
  const oIngresos = await okr('Crecer los ingresos de forma rentable', null, null, 'andres');
  const krVentas = await kr(oIngresos, 'Ventas del trimestre: 12.000 M COP', { meta: 12000, valor: 10450, unidad: 'M COP', inicial: 0 });
  await kr(oIngresos, 'Margen bruto del 32%', { meta: 32, valor: 30.6, unidad: '%', inicial: 28 });
  const oServicio = await okr('Ofrecer una experiencia de servicio sobresaliente', null, null, 'andres');
  const krNps = await kr(oServicio, 'NPS de clientes de 60 puntos o más');
  const oCom = await okr('Ampliar la cartera de clientes corporativos', 'com', krVentas, 'camila');
  const krCom = await kr(oCom, 'Cumplir la cuota comercial del trimestre');
  const oVen = await okr('Cerrar más negocios con empresas medianas', 'ven', krCom, 'julian');
  const krVen = await kr(oVen, 'Ventas corporativas sobre la meta mensual');
  const oOpe = await okr('Entregar a tiempo y resolver al primer contacto', 'ope', krNps, 'felipe');
  const krOpe = await kr(oOpe, 'Operación confiable para el cliente');
  const oLog = await okr('Despachos puntuales y sin errores', 'log', krOpe, 'natalia');
  const krLog = await kr(oLog, 'Entregas a tiempo sobre el 96%');
  const oSer = await okr('Resolver cada caso en el primer contacto', 'ser', krOpe, 'paula');
  const krSer = await kr(oSer, 'Resolución al primer contacto del 80%');
  const krPorEtiqueta: Record<string, Record<string, number>> = {
    ventas: { com: krCom, mer: krCom },
    ventasCorp: { ven: krVen },
    entregas: { ope: krOpe, log: krLog },
    nps: { ser: krSer },
    primerContacto: { ser: krSer },
  };

  // ---------------- KPIs y resultados (julio a noviembre de 2026)
  const MESES = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const ACTUAL = claveMes();
  for (const p of PERSONAS) {
    const defs = KPIS[p.cargo] || [];
    const [lo, hi] = PROGRESO[p.perfil];
    for (const [titulo, unidad, meta, direccion, peso, etiqueta] of defs) {
      const kpi = ok(await admin.from('indicadores').insert({
        empleado_id: empId[p.clave], titulo, unidad_medida: unidad, meta_esperada: meta, direccion, periodo: 'mensual', peso: defs.length > 1 ? peso : null,
        kr_id: etiqueta ? krPorEtiqueta[etiqueta]?.[p.area] ?? null : null, progreso: 0, resultado_actual: 0,
      }).select('id').single(), `KPI ${titulo}`)!.id as number;
      for (const [i, mes] of MESES.entries()) {
        if (mes === ACTUAL && azar() < 0.3) continue; // algunos KPIs del mes en curso aún sin calificar
        const tendencia = (i - 2) * 0.012; // leve mejora en el tiempo
        const resultado = resultadoPara(meta, direccion, entre(lo, hi) + tendencia);
        await admin.from('resultados_kpi').insert({
          indicador_id: kpi, empleado_id: empId[p.clave], empresa_id: EMPRESA, periodo: mes, resultado,
          progreso: calcularProgreso(direccion, meta, resultado), registrado_por: null,
        });
      }
      await refrescarKpiVigente(admin, kpi);
    }
  }

  // Cierres oficiales de julio a octubre (foto oficial + bloqueo del mes)
  for (const mes of MESES.filter(m => m < ACTUAL)) {
    const { data } = await admin.from('empleados').select('id, potencial_score, indicadores(id, peso, resultados:resultados_kpi(periodo, progreso))').eq('empresa_id', EMPRESA);
    const fotos = (data || []).map(e => {
      const kpis = (e.indicadores || []) as { id: number; peso: number | null; resultados: { periodo: string; progreso: number }[] }[];
      const pesos = pesosEfectivos(kpis);
      const delMes = kpis.flatMap(k => k.resultados.filter(r => r.periodo === mes).map(r => ({ progreso: Number(r.progreso), peso: pesos.get(k.id) ?? 0 })));
      const c = promedioPonderado(delMes);
      return c === null ? null : { empleado_id: e.id, empresa_id: EMPRESA, periodo: etiquetaMes(mes), cumplimiento: c, potencial_score: e.potencial_score, total_kpis: delMes.length, fecha_corte: `${sumarMeses(mes, 1)}-05T12:00:00Z`, oficial: true };
    }).filter(Boolean);
    ok(await admin.from('historico_cumplimiento').upsert(fotos, { onConflict: 'empleado_id,periodo' }), `Cierre ${mes}`);
    ok(await admin.from('periodos_cerrados').insert({ empresa_id: EMPRESA, periodo: mes, cerrado_en: `${sumarMeses(mes, 1)}-05T12:00:00Z` }), `Cierre ${mes}`);
  }
  for (const p of PERSONAS) await recalcularCumplimiento(admin, empId[p.clave], EMPRESA, p.potencial, ACTUAL);

  // Planes de mejora para quienes van bajo
  const PLANES: [string, string, string][] = [
    ['valentina', 'Agendar 5 visitas semanales a clientes del segmento medio', 'Revisemos el embudo cada viernes; ya tienes 3 citas confirmadas.'],
    ['diego', 'Reducir los errores de alistamiento con doble verificación', 'Buen avance esta semana: bajaste a 4 errores.'],
    ['samuel', 'Completar el curso de manejo de objeciones y aplicarlo en llamadas', 'Te comparto dos llamadas modelo para que las escuches.'],
    ['luisf', 'Entregar el informe de flujo de caja el día 3 de cada mes', 'Octubre llegó a tiempo, sigamos así.'],
  ];
  for (const [clave, compromiso, comentario] of PLANES) {
    const lim = new Date(); lim.setDate(lim.getDate() + Math.round(entre(-3, 20)));
    const plan = ok(await admin.from('planes_mejora').insert({ empleado_id: empId[clave], empresa_id: EMPRESA, compromiso, estado: 'pendiente', fecha_limite: lim.toISOString(), created_at: new Date(Date.now() - 20 * 864e5).toISOString() }).select('id').single(), 'Plan');
    const autor = PERSONAS.find(x => x.lider && x.area === PERSONAS.find(y => y.clave === clave)!.area)!.nombre;
    await admin.from('comentarios').insert({ plan_id: plan!.id, autor, texto: comentario, empresa_id: EMPRESA });
  }

  await sembrar360(empId);
  console.log('✅ Datos de demostración cargados.');
}

// ------------------------------------------------------------------ Evaluación 360 (ciclo anterior cerrado + ciclo actual en entrega)
const FORTALEZAS = [
  'En la reunión de cierre de trimestre explicó con datos el avance de su equipo y eso facilitó decidir rápido.',
  'Cuando hubo retrasos con un proveedor, propuso un plan alterno el mismo día y evitó afectar a los clientes.',
  'Comparte lo que sabe: armó una guía práctica que hoy usa todo el equipo nuevo.',
  'Escucha antes de proponer; en el comité de la semana pasada integró ideas de otras áreas.',
  'Cumple lo que promete: las entregas de este semestre llegaron completas y a tiempo.',
  'Mantiene la calma en momentos de presión y transmite confianza al equipo.',
];
const CONSEJOS = [
  'En las próximas reuniones, comparte tus prioridades de la semana al inicio para que el equipo se alinee antes.',
  'Pide retroalimentación a tus clientes internos al terminar cada proyecto; te ayudará a anticipar sus necesidades.',
  'Delega una de tus tareas recurrentes en alguien del equipo y acompáñalo las primeras semanas.',
  'Cuando haya desacuerdos, propón opciones concretas por escrito para cerrar la decisión en la misma reunión.',
  'Reserva un espacio quincenal para dar feedback individual a cada persona de tu equipo.',
  'Antes de presentar un análisis, valida los supuestos con el área involucrada para evitar reprocesos.',
];
const BASE_360: Record<Perfil, number> = { alto: 4.15, medio: 3.55, bajo: 2.95 };

async function sembrar360(empId: Record<string, number>) {
  const { data: comps } = await admin.from('ev360_competencias').select('id, nombre, descripcion, grupo').eq('empresa_id', EMPRESA).order('orden');
  const { data: conds } = await admin.from('ev360_conductas').select('id, competencia_id, texto').eq('empresa_id', EMPRESA).order('orden');
  const cuestionario: Cuestionario = { competencias: (comps || []).map(c => ({ ...c, conductas: (conds || []).filter(x => x.competencia_id === c.id).map(x => ({ id: x.id, texto: x.texto })) })) };
  const { data: areas } = await admin.from('areas').select('*').eq('empresa_id', EMPRESA);
  const { data: activos } = await admin.from('empleados').select('id, area_id, jefe_directo_id').eq('empresa_id', EMPRESA);
  const porId = new Map(PERSONAS.map(p => [empId[p.clave], p]));
  // Sesgo por competencia de cada persona (fortalezas y oportunidades propias)
  const sesgo = new Map<string, number>();
  PERSONAS.forEach(p => cuestionario.competencias.forEach(c => sesgo.set(`${p.clave}|${c.id}`, entre(-0.55, 0.45))));
  // Quiénes se sobrevaloran (punto ciego) o se subvaloran (fortaleza oculta)
  const autoAjuste = (p: Persona) => (['valentina', 'felipe', 'luisf', 'daniela'].includes(p.clave) ? 0.75 : ['juliana', 'tomas', 'gabriela'].includes(p.clave) ? -0.6 : entre(-0.15, 0.3));

  const ciclos = [
    { nombre: 'Evaluación 360 · 1.er semestre 2026', desde: '2026-01-01', hasta: '2026-06-30', estado: 'cerrado', fechas: ['2026-06-05', '2026-06-19', '2026-06-26'], mejora: -0.25, conversados: 1 },
    { nombre: 'Evaluación 360 · 2.º semestre 2026', desde: '2026-07-01', hasta: '2026-12-31', estado: 'resultados', fechas: ['2026-11-06', '2026-11-17', '2026-11-21'], mejora: 0, conversados: 0.6 },
  ];
  for (const c of ciclos) {
    const ciclo = ok(await admin.from('ev360_ciclos').insert({
      empresa_id: EMPRESA, nombre: c.nombre, frecuencia: 'semestral', periodo_desde: c.desde, periodo_hasta: c.hasta,
      nominacion_hasta: c.fechas[0], evaluacion_hasta: c.fechas[1], calibracion_hasta: c.fechas[2], estado: c.estado,
      cuestionario, lanzado_en: `${c.fechas[0].slice(0, 8)}01T12:00:00Z`,
    }).select('id').single(), c.nombre)!.id as number;
    const lideres = new Map((activos || []).map(e => [e.id, liderDirectoDe(e, areas || [], activos || [])]));
    const conEquipo = new Set([...lideres.values()].filter((x): x is number => x !== null));
    const participantes = (activos || []).map(e => ({ ciclo_id: ciclo, empresa_id: EMPRESA, evaluado_id: e.id, lider_id: lideres.get(e.id) ?? null, es_lider: conEquipo.has(e.id) }));
    const partes = ok(await admin.from('ev360_participantes').insert(participantes).select('id, evaluado_id, lider_id, es_lider'), 'Participantes')!;
    const filas = asignacionesAutomaticas(participantes).map(a => ({ ...a, ciclo_id: ciclo, empresa_id: EMPRESA } as Record<string, unknown>));
    // Pares: compañeros de la misma área o líderes del mismo nivel (3 por persona)
    for (const p of participantes) {
      const yo = porId.get(p.evaluado_id)!;
      const ya = new Set(filas.filter(f => f.evaluado_id === p.evaluado_id).map(f => f.evaluador_id));
      const candidatos = PERSONAS.filter(x => x.clave !== yo.clave && !ya.has(empId[x.clave]) &&
        (yo.lider ? x.lider && PERSONAS.find(z => z.area === x.area) && x.nivel === yo.nivel : x.area === yo.area && !x.lider))
        .concat(PERSONAS.filter(x => x.clave !== yo.clave && !ya.has(empId[x.clave]) && (yo.lider ? x.lider : x.area !== yo.area && AREAS.find(a => a.clave === x.area)?.padre === AREAS.find(a => a.clave === yo.area)?.padre)));
      const elegidos = [...new Set(candidatos.map(x => x.clave))].slice(0, 3);
      elegidos.forEach(k => filas.push({ ciclo_id: ciclo, empresa_id: EMPRESA, evaluado_id: p.evaluado_id, evaluador_id: empId[k], relacion: 'par', asignada_por: p.lider_id }));
    }
    const asignaciones = ok(await admin.from('ev360_asignaciones').insert(filas).select('id, evaluado_id, evaluador_id, relacion'), 'Asignaciones')!;
    const esLider = new Map(partes.map(x => [x.evaluado_id, x.es_lider]));

    for (const a of asignaciones) {
      if (c.estado === 'resultados' && a.relacion === 'par' && azar() < 0.06) continue; // algunas quedaron sin responder
      const evaluado = porId.get(a.evaluado_id)!;
      const items = cuestionario.competencias.filter(k => k.grupo === 'corporativa' || esLider.get(a.evaluado_id));
      const base = BASE_360[evaluado.perfil] + c.mejora + (a.relacion === 'auto' ? autoAjuste(evaluado) : a.relacion === 'lider' ? -0.05 : 0);
      const respuestas = items.flatMap(k => k.conductas.map(x => {
        const v = azar() < 0.04 && a.relacion !== 'auto' ? null : Math.max(1, Math.min(5, Math.round(base + (sesgo.get(`${evaluado.clave}|${k.id}`) ?? 0) + entre(-0.6, 0.6))));
        return { asignacion_id: a.id, competencia_id: k.id, conducta_id: x.id, puntaje: v };
      }));
      ok(await admin.from('ev360_respuestas').insert(respuestas), 'Respuestas');
      ok(await admin.from('ev360_asignaciones').update({ estado: 'completada', fortaleza: elegir(FORTALEZAS), consejo: elegir(CONSEJOS), completada_en: `${c.fechas[1]}T15:00:00Z` }).eq('id', a.id), 'Completar');
    }

    // Conversaciones 1:1 y planes de desarrollo
    for (const p of partes) {
      if (!p.lider_id || azar() > c.conversados) continue;
      const persona = porId.get(p.evaluado_id)!;
      ok(await admin.from('ev360_participantes').update({
        conversado_en: `${c.fechas[2]}T16:00:00Z`, conversado_por: p.lider_id,
        acuerdos: 'Acordamos enfocarnos en una competencia durante el semestre, con un reto práctico, acompañamiento quincenal y revisión en el check-in mensual.',
        reflexion: azar() < 0.6 ? 'Me sorprendió la diferencia entre cómo me veo y cómo me ven en comunicación. Voy a pedir feedback más seguido.' : null,
      }).eq('id', p.id), 'Conversación');
      if (c.estado !== 'resultados') continue;
      const debil = cuestionario.competencias.filter(k => k.grupo === 'corporativa' || p.es_lider)
        .sort((x, y) => (sesgo.get(`${persona.clave}|${x.id}`) ?? 0) - (sesgo.get(`${persona.clave}|${y.id}`) ?? 0))[0];
      const obj = ok(await admin.from('pdi_objetivos').insert({
        empresa_id: EMPRESA, empleado_id: p.evaluado_id, ciclo_id: ciclo, competencia_id: debil.id, competencia: debil.nombre,
        titulo: `Fortalecer ${debil.nombre.toLowerCase()} en mi trabajo diario`, resultado_esperado: `Mi líder y mis pares observan un avance en ${debil.nombre.toLowerCase()} en el próximo pulso.`,
        fecha_limite: '2027-03-31', estado: 'en_curso', creado_por: p.lider_id,
      }).select('id').single(), 'PDI')!.id;
      const acciones = [
        ['experiencia', `Liderar un proyecto del área donde deba aplicar ${debil.nombre.toLowerCase()}.`, azar() < 0.5],
        ['experiencia', 'Presentar los avances del proyecto en el comité mensual.', false],
        ['relacion', 'Sesión quincenal de acompañamiento con un mentor de otra área.', azar() < 0.7],
        ['formacion', `Taller de 8 horas sobre ${debil.nombre.toLowerCase()}.`, azar() < 0.4],
      ] as const;
      ok(await admin.from('pdi_acciones').insert(acciones.map(([tipo, descripcion, hecha], i) => ({ objetivo_id: obj, empresa_id: EMPRESA, tipo, descripcion, completada: hecha, completada_en: hecha ? new Date().toISOString() : null, orden: i }))), 'Acciones');
      if (azar() < 0.65) ok(await admin.from('pdi_checkins').insert({ empresa_id: EMPRESA, empleado_id: p.evaluado_id, periodo: '2026-11', comentario: 'Arrancamos el plan: ya está definido el proyecto y la primera sesión con el mentor. El reto es encontrar tiempo en la semana.', proximos_pasos: 'Reservar dos bloques semanales para el proyecto y agendar el taller.', registrado_por: p.lider_id }), 'Check-in');
    }
  }
}

main().catch(e => { console.error(`\n❌ ${e instanceof Error ? e.message : e}`); process.exitCode = 1; });
