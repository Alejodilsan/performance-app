'use client'
// Lectura del archivo subido y generación de la plantilla (navegador). Usa exceljs.
import ExcelJS from 'exceljs'
import {
  TIPOS_DOCUMENTO, TIPOS_CONTRATO, MODALIDADES, JORNADAS, PERIODICIDADES, MONEDAS,
  type Area, type Empleado, type NivelCargo, type Puesto, type RangoSalarialCargo,
} from './tipos'
import { COLUMNAS, MAX_FILAS, type ClaveColumna, type DefColumna } from './importacion'
import { COLUMNAS_AREAS, COLUMNAS_CARGOS, NOMBRE_HOJA, type Hoja } from './estructura'
import { normalizarTexto } from './jerarquia'

export interface ArchivoLeido { encabezados: string[]; filas: { numero: number; celdas: string[] }[] }
/** Hojas reconocidas del libro (las que no vienen quedan sin definir) */
export type LibroLeido = Partial<Record<Hoja, ArchivoLeido>>;

const NOMBRES_HOJA: Record<Hoja, string[]> = {
  areas: ['areas', 'area', 'estructura', 'departamentos'],
  cargos: ['cargos', 'cargo', 'puestos', 'puestos de trabajo', 'catalogo de cargos'],
  colaboradores: ['colaboradores', 'empleados', 'personas', 'personal', 'nomina'],
};

/**
 * Lee .xlsx (hojas Áreas, Cargos y Colaboradores, en cualquier orden) o .csv (solo colaboradores).
 * Si el libro no tiene hojas con esos nombres, la primera hoja visible se toma como Colaboradores.
 */
export async function leerLibro(archivo: File): Promise<LibroLeido> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.csv') || archivo.type === 'text/csv') return { colaboradores: leerCsv(await archivo.text()) };
  if (!nombre.endsWith('.xlsx')) throw new Error('Formato no soportado. Sube un archivo .xlsx o .csv (si tienes .xls, guárdalo como .xlsx).');

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const visibles = libro.worksheets.filter(h => h.state === 'visible');
  if (visibles.length === 0) throw new Error('El archivo no tiene hojas.');
  const resultado: LibroLeido = {};
  (Object.keys(NOMBRES_HOJA) as Hoja[]).forEach(clave => {
    const hoja = visibles.find(h => NOMBRES_HOJA[clave].includes(normalizarTexto(h.name)));
    if (hoja) { const leida = leerHoja(hoja); if (leida) resultado[clave] = leida; }
  });
  if (Object.keys(resultado).length === 0) {
    const primera = visibles.find(h => normalizarTexto(h.name) !== 'instrucciones') ?? visibles[0];
    const leida = leerHoja(primera);
    if (leida) resultado.colaboradores = leida;
  }
  if (Object.values(resultado).every(h => !h || h.filas.length === 0)) throw new Error('El archivo no tiene filas de datos debajo de los encabezados.');
  return resultado;
}

function leerHoja(hoja: ExcelJS.Worksheet): ArchivoLeido | null {
  const filas: { numero: number; celdas: string[] }[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    const celdas: string[] = [];
    for (let c = 1; c <= hoja.columnCount; c++) celdas.push(textoCelda(fila.getCell(c).value));
    if (celdas.some(x => x.trim() !== '')) filas.push({ numero, celdas });
  });
  if (filas.length === 0) return null;
  const [cabecera, ...datos] = filas;
  if (datos.length > MAX_FILAS) throw new Error(`La hoja "${hoja.name}" tiene ${datos.length} filas; el máximo por hoja es ${MAX_FILAS}.`);
  return sinColumnasVacias(cabecera.celdas.map(s => s.trim().replace(/\s*\*$/, '')), datos);
}

/**
 * Quita las columnas sin encabezado y sin ningún dato. Excel cuenta como usadas las columnas con formato
 * o listas desplegables aunque estén vacías, y no deben aparecer en el mapeo.
 */
function sinColumnasVacias(encabezados: string[], filas: { numero: number; celdas: string[] }[]): ArchivoLeido {
  const total = Math.max(encabezados.length, ...filas.map(f => f.celdas.length));
  const conservar = Array.from({ length: total }, (_, i) => i)
    .filter(i => (encabezados[i] ?? '').trim() !== '' || filas.some(f => (f.celdas[i] ?? '').trim() !== ''));
  return {
    encabezados: conservar.map(i => encabezados[i] ?? ''),
    filas: filas.map(f => ({ numero: f.numero, celdas: conservar.map(i => f.celdas[i] ?? '') })),
  };
}

/** Convierte cualquier valor de celda de Excel (fecha, fórmula, texto enriquecido, hipervínculo) a texto. */
function textoCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return textoCelda(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return String(v);
}

function leerCsv(texto: string): ArchivoLeido {
  const limpio = texto.replace(/^﻿/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] || '';
  const sep = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }
  const conDatos = filas.map((c, i) => ({ numero: i + 1, celdas: c })).filter(f => f.celdas.some(x => x.trim() !== ''));
  if (conDatos.length === 0) throw new Error('El archivo está vacío.');
  const [cabecera, ...datos] = conDatos;
  if (datos.length > MAX_FILAS) throw new Error(`El archivo tiene ${datos.length} filas; el máximo por carga es ${MAX_FILAS}.`);
  return sinColumnasVacias(cabecera.celdas.map(s => s.trim()), datos);
}

// ------------------------------------------------------------------
// Plantilla: Instrucciones · Áreas · Cargos · Colaboradores
// ------------------------------------------------------------------

export interface DatosPlantilla {
  puestos: Puesto[];
  areas: Area[];
  niveles: NivelCargo[];
  rangos?: Map<number, RangoSalarialCargo>;
  /** Todos los activos (para el email del líder de cada área) */
  activos: Empleado[];
  /** Si viene, la hoja Colaboradores sale con estos colaboradores ya llenos para completar o actualizar */
  colaboradores?: Empleado[];
  salarios?: Map<number, { salario: number; moneda: string; periodicidad: string; fecha_vigencia: string }>;
  potencialEvaluado?: Set<number>;
  monedaPrincipal: string;
}

const LISTAS: Partial<Record<ClaveColumna, () => string[]>> = {
  tipo_perfil: () => ['Admin', 'Manager', 'Líder de Área', 'Empleado', 'Auditor'],
  tipo_documento: () => [...TIPOS_DOCUMENTO],
  tipo_contrato: () => Object.values(TIPOS_CONTRATO),
  modalidad: () => Object.values(MODALIDADES),
  jornada: () => Object.values(JORNADAS),
  moneda: () => [...MONEDAS],
  periodicidad: () => Object.values(PERIODICIDADES),
  potencial: () => ['Bajo', 'Medio', 'Alto'],
};

const FILAS_LIBRES = 500;
// Colores AlemiaHR: obligatoria = azul profundo, solo para nuevos = azul medio, opcional = gris
const COLOR = { obligatoria: 'FF0F2942', crear: 'FF2A4B70', opcional: 'FF64748B', completar: 'FFFEF3C7' };

/** Crea una hoja con encabezados de color y notas de ayuda. */
function hojaConColumnas<K extends string>(libro: ExcelJS.Workbook, nombre: string, columnas: DefColumna<K>[]) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas.map(c => ({
    header: c.obligatoria ? `${c.encabezado} *` : c.encabezado,
    key: c.clave,
    width: Math.max(16, c.encabezado.length + 6, c.clave === 'descripcion' ? 50 : 0),
    style: c.tipo === 'fecha' ? { numFmt: 'yyyy-mm-dd' } : undefined,
  }));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.height = 22;
  columnas.forEach((c, i) => {
    const celda = cab.getCell(i + 1);
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obligatoria === 'siempre' ? COLOR.obligatoria : c.obligatoria ? COLOR.crear : COLOR.opcional } };
    celda.note = c.ayuda;
  });
  return hoja;
}

/** Lista desplegable en una columna. estricta = false permite escribir un valor nuevo (se valida al importar). */
function listaEnColumna(hoja: ExcelJS.Worksheet, columna: number, rango: string, hasta: number, estricta: boolean, titulo: string) {
  const letra = hoja.getColumn(columna).letter;
  for (let r = 2; r <= hasta; r++) {
    hoja.getCell(`${letra}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [rango], showErrorMessage: estricta,
      errorTitle: 'Valor no válido', error: `Elige un valor de la lista para "${titulo}".`,
    };
  }
}

export async function descargarPlantilla(d: DatosPlantilla): Promise<void> {
  await descargar(construirPlantilla(d), d.colaboradores?.length ? `Carga_inicial_${new Date().toISOString().slice(0, 10)}.xlsx` : 'Plantilla_Carga_Inicial.xlsx');
}

/** Arma el libro de la plantilla (separado de la descarga para poder probarlo fuera del navegador). */
export function construirPlantilla(d: DatosPlantilla): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Performance App';
  const instrucciones = libro.addWorksheet('Instrucciones');
  const hAreas = hojaConColumnas(libro, NOMBRE_HOJA.areas, COLUMNAS_AREAS);
  const hCargos = hojaConColumnas(libro, NOMBRE_HOJA.cargos, COLUMNAS_CARGOS);
  const hColab = hojaConColumnas(libro, NOMBRE_HOJA.colaboradores, COLUMNAS);
  const catalogos = libro.addWorksheet('Catalogos');
  catalogos.state = 'veryHidden';

  const nombreArea = (id: number | null | undefined) => d.areas.find(a => a.id === id)?.nombre ?? '';
  const emailPorId = new Map(d.activos.map(e => [e.id, e.email]));

  // Áreas y cargos actuales SIEMPRE van precargados: así se ve la estructura completa y las listas de las otras hojas los incluyen
  const areasOrdenadas = [...d.areas].sort((a, b) => profundidad(a, d.areas) - profundidad(b, d.areas) || a.nombre.localeCompare(b.nombre, 'es'));
  areasOrdenadas.forEach(a => hAreas.addRow({
    nombre: a.nombre, depende_de: nombreArea(a.parent_id), lider_email: a.lider_id ? emailPorId.get(a.lider_id) ?? '' : '',
  }));
  const cargosOrdenados = [...d.puestos].sort((a, b) => nombreArea(a.area_id).localeCompare(nombreArea(b.area_id), 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  cargosOrdenados.forEach(p => {
    const r = d.rangos?.get(p.id);
    const fila = hCargos.addRow({
      nombre: p.nombre, area: nombreArea(p.area_id), nivel: d.niveles.find(n => n.id === p.nivel_id)?.nombre ?? '',
      descripcion: p.descripcion ?? '', salario_min: r?.salario_min ?? '', salario_max: r?.salario_max ?? '', moneda: r ? r.moneda : '',
    });
    if (p.area_id == null) {
      const celda = fila.getCell(2);
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.completar } };
      celda.note = 'Este cargo aún no tiene área: complétala.';
    }
  });

  // Catálogos (hoja oculta) para las listas que no salen de otra hoja
  const listas: Record<string, string[]> = {
    ...Object.fromEntries(Object.entries(LISTAS).map(([k, f]) => [k, f!()])),
    nivel: d.niveles.map(n => n.nombre),
  };
  const rangos: Record<string, string> = {};
  let colCat = 1;
  Object.entries(listas).forEach(([clave, valores]) => {
    if (valores.length === 0) return;
    const letra = catalogos.getColumn(colCat).letter;
    valores.forEach((v, i) => { catalogos.getCell(`${letra}${i + 1}`).value = v; });
    rangos[clave] = `Catalogos!$${letra}$1:$${letra}$${valores.length}`;
    colCat++;
  });
  const hastaAreas = d.areas.length + FILAS_LIBRES;
  const hastaCargos = d.puestos.length + FILAS_LIBRES;
  const rangoAreas = `'${NOMBRE_HOJA.areas}'!$A$2:$A$${hastaAreas}`;
  const rangoCargos = `'${NOMBRE_HOJA.cargos}'!$A$2:$A$${hastaCargos}`;
  const col = <K extends string>(cols: DefColumna<K>[], k: K) => cols.findIndex(c => c.clave === k) + 1;

  listaEnColumna(hAreas, col(COLUMNAS_AREAS, 'depende_de'), rangoAreas, hastaAreas, false, 'Depende de');
  listaEnColumna(hCargos, col(COLUMNAS_CARGOS, 'area'), rangoAreas, hastaCargos, false, 'Área');
  if (rangos.nivel) listaEnColumna(hCargos, col(COLUMNAS_CARGOS, 'nivel'), rangos.nivel, hastaCargos, false, 'Nivel');
  listaEnColumna(hCargos, col(COLUMNAS_CARGOS, 'moneda'), rangos.moneda, hastaCargos, true, 'Moneda rango');

  // Colaboradores (opcional: con los datos actuales)
  (d.colaboradores || []).forEach(e => {
    const s = d.salarios?.get(e.id);
    hColab.addRow({
      nombre: e.nombre, email: e.email, puesto: e.puesto, tipo_perfil: e.tipo_perfil || 'Empleado', area: nombreArea(e.area_id),
      jefe_email: e.jefe_directo_id ? emailPorId.get(e.jefe_directo_id) ?? '' : '',
      fecha_ingreso: e.fecha_ingreso ? new Date(e.fecha_ingreso + 'T00:00:00Z') : '',
      tipo_documento: e.tipo_documento ?? '', numero_documento: e.numero_documento ?? '',
      fecha_nacimiento: e.fecha_nacimiento ? new Date(e.fecha_nacimiento + 'T00:00:00Z') : '',
      telefono: e.telefono ?? '', email_personal: e.email_personal ?? '', sede: e.sede ?? '', centro_costo: e.centro_costo ?? '',
      tipo_contrato: e.tipo_contrato ? TIPOS_CONTRATO[e.tipo_contrato] : '', modalidad: e.modalidad ? MODALIDADES[e.modalidad] : '',
      jornada: e.jornada ? JORNADAS[e.jornada] : '',
      salario: s ? s.salario : '', moneda: s ? s.moneda : '',
      periodicidad: s ? PERIODICIDADES[s.periodicidad as keyof typeof PERIODICIDADES] ?? '' : '',
      salario_desde: s ? new Date(s.fecha_vigencia + 'T00:00:00Z') : '', motivo_salario: '',
      potencial: d.potencialEvaluado?.has(e.id) && e.potencial_score ? ['', 'Bajo', 'Medio', 'Alto'][e.potencial_score] : '',
    });
  });
  const hastaColab = (d.colaboradores?.length || 0) + FILAS_LIBRES;
  COLUMNAS.forEach((c, i) => {
    if (c.clave === 'area') listaEnColumna(hColab, i + 1, rangoAreas, hastaColab, false, c.encabezado);
    else if (c.clave === 'puesto') listaEnColumna(hColab, i + 1, rangoCargos, hastaColab, false, c.encabezado);
    else if (rangos[c.clave]) listaEnColumna(hColab, i + 1, rangos[c.clave], hastaColab, true, c.encabezado);
  });

  // Instrucciones
  instrucciones.columns = [{ header: 'Columna', key: 'c', width: 26 }, { header: '¿Obligatoria?', key: 'o', width: 18 }, { header: 'Cómo llenarla', key: 'a', width: 95 }, { header: 'Ejemplo', key: 'e', width: 28 }];
  instrucciones.getRow(1).font = { bold: true };
  const titulo = (t: string) => { const r = instrucciones.addRow({ c: t }); r.font = { bold: true, color: { argb: 'FF059669' } }; };
  const nota = (t: string) => instrucciones.addRow({ a: t });
  titulo('CÓMO FUNCIONA');
  nota('Llena las hojas en orden: 1) Áreas → 2) Cargos → 3) Colaboradores. Puedes subir solo las hojas que necesites.');
  nota('Las áreas y cargos que ya existen vienen precargados: corrígelos o agrega filas nuevas debajo. Las listas desplegables de Cargos y Colaboradores toman los nombres que escribas en esas hojas.');
  nota('Si un nombre ya existe (sin importar MAYÚSCULAS, tildes o espacios de más) se ACTUALIZA, nunca se duplica. "logistica " y "Logística" son la misma área.');
  nota('Si un nombre solo se PARECE a otro ("Analista Sr" / "Analista Senior", "RRHH" / "Recursos Humanos"), en la revisión te preguntaremos si son el mismo o uno nuevo.');
  nota('Un cargo pertenece a un área: "Analista" de Finanzas y "Analista" de Operaciones son cargos distintos. Las celdas amarillas son cargos sin área: complétalas.');
  nota('Las celdas vacías NO borran datos existentes. Antes de aplicar verás exactamente qué se crea y qué cambia.');
  nota(`Moneda principal de la empresa: ${d.monedaPrincipal}. Los rangos salariales de los cargos y los salarios solo los ve el Admin.`);
  const seccion = <K extends string>(nombre: string, cols: DefColumna<K>[]) => {
    instrucciones.addRow({});
    titulo(`HOJA ${nombre.toUpperCase()}`);
    cols.forEach(c => instrucciones.addRow({ c: c.encabezado, o: c.obligatoria === 'siempre' ? 'Sí' : c.obligatoria === 'crear' ? 'Solo para nuevos' : 'No', a: c.ayuda, e: c.ejemplo }));
  };
  seccion(NOMBRE_HOJA.areas, COLUMNAS_AREAS);
  seccion(NOMBRE_HOJA.cargos, COLUMNAS_CARGOS);
  seccion(NOMBRE_HOJA.colaboradores, COLUMNAS);
  instrucciones.getColumn('a').alignment = { wrapText: true, vertical: 'top' };
  return libro;
}

function profundidad(a: Area, areas: Area[]): number {
  let d = 0, actual: Area | undefined = a;
  const vistos = new Set<number>();
  while (actual?.parent_id != null && !vistos.has(actual.id)) { vistos.add(actual.id); actual = areas.find(x => x.id === actual!.parent_id); d++; }
  return d;
}

async function descargar(libro: ExcelJS.Workbook, nombre: string) {
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel con las filas que tuvieron errores (una hoja por hoja original) y una columna "Errores", para corregir y volver a subir. */
export async function descargarErrores(hojas: { nombre: string; encabezados: string[]; filas: { celdas: string[]; errores: string[] }[] }[]): Promise<void> {
  const libro = new ExcelJS.Workbook();
  hojas.filter(h => h.filas.length > 0).forEach(h => {
    const hoja = libro.addWorksheet(h.nombre);
    hoja.addRow([...h.encabezados, 'Errores']).font = { bold: true };
    h.filas.forEach(f => hoja.addRow([...f.celdas, f.errores.join(' | ')]));
    hoja.getColumn(h.encabezados.length + 1).width = 80;
    hoja.getColumn(h.encabezados.length + 1).font = { color: { argb: 'FFB91C1C' } };
  });
  await descargar(libro, `Errores_importacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
