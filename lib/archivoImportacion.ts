'use client'
// Lectura del archivo subido y generación de la plantilla (navegador). Usa exceljs.
import ExcelJS from 'exceljs'
import { TIPOS_DOCUMENTO, TIPOS_CONTRATO, MODALIDADES, JORNADAS, PERIODICIDADES, MONEDAS, type Area, type Empleado, type Puesto } from './tipos'
import { COLUMNAS, MAX_FILAS, type ClaveColumna } from './importacion'

export interface ArchivoLeido { encabezados: string[]; filas: { numero: number; celdas: string[] }[] }

/** Lee .xlsx o .csv. Devuelve los encabezados (primera fila con datos) y las filas como texto. */
export async function leerArchivo(archivo: File): Promise<ArchivoLeido> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.csv') || archivo.type === 'text/csv') return leerCsv(await archivo.text());
  if (!nombre.endsWith('.xlsx')) throw new Error('Formato no soportado. Sube un archivo .xlsx o .csv (si tienes .xls, guárdalo como .xlsx).');

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.getWorksheet('Colaboradores') ?? libro.worksheets.find(h => h.state === 'visible') ?? libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas.');

  const filas: { numero: number; celdas: string[] }[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    const celdas: string[] = [];
    for (let c = 1; c <= hoja.columnCount; c++) celdas.push(textoCelda(fila.getCell(c).value));
    if (celdas.some(x => x.trim() !== '')) filas.push({ numero, celdas });
  });
  if (filas.length === 0) throw new Error('La hoja está vacía.');
  const [cabecera, ...datos] = filas;
  if (datos.length > MAX_FILAS) throw new Error(`El archivo tiene ${datos.length} filas; el máximo por carga es ${MAX_FILAS}.`);
  return { encabezados: cabecera.celdas.map(s => s.trim()), filas: datos };
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
  return { encabezados: cabecera.celdas.map(s => s.trim()), filas: datos };
}

// ------------------------------------------------------------------
// Plantilla
// ------------------------------------------------------------------

export interface DatosPlantilla {
  puestos: Puesto[];
  areas: Area[];
  /** Si viene, la plantilla sale con estos colaboradores ya llenos para completar o actualizar */
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

export async function descargarPlantilla(d: DatosPlantilla): Promise<void> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Performance App';
  const hoja = libro.addWorksheet('Colaboradores', { views: [{ state: 'frozen', ySplit: 1 }] });
  const instrucciones = libro.addWorksheet('Instrucciones');
  const catalogos = libro.addWorksheet('Catalogos');
  catalogos.state = 'veryHidden';

  hoja.columns = COLUMNAS.map(c => ({
    header: c.obligatoria ? `${c.encabezado} *` : c.encabezado,
    key: c.clave,
    width: Math.max(16, c.encabezado.length + 6),
    style: c.tipo === 'fecha' ? { numFmt: 'yyyy-mm-dd' } : undefined,
  }));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.height = 22;
  COLUMNAS.forEach((c, i) => {
    const celda = cab.getCell(i + 1);
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obligatoria === 'siempre' ? 'FFFF4C4C' : c.obligatoria ? 'FF334155' : 'FF64748B' } };
    celda.note = c.ayuda;
  });

  // Catálogos para las listas desplegables (hoja oculta)
  const listas: Partial<Record<ClaveColumna, string[]>> = {
    ...Object.fromEntries(Object.entries(LISTAS).map(([k, f]) => [k, f!()])),
    puesto: d.puestos.map(p => p.nombre),
    area: d.areas.map(a => a.nombre),
  };
  let colCat = 1;
  const rangos: Partial<Record<ClaveColumna, string>> = {};
  (Object.entries(listas) as [ClaveColumna, string[]][]).forEach(([clave, valores]) => {
    if (valores.length === 0) return;
    const letra = catalogos.getColumn(colCat).letter;
    valores.forEach((v, i) => { catalogos.getCell(`${letra}${i + 1}`).value = v; });
    rangos[clave] = `Catalogos!$${letra}$1:$${letra}$${valores.length}`;
    colCat++;
  });

  // Filas con datos actuales (opcional)
  const nombreArea = (id: number | null) => d.areas.find(a => a.id === id)?.nombre ?? '';
  const emailPorId = new Map((d.colaboradores || []).map(e => [e.id, e.email]));
  (d.colaboradores || []).forEach(e => {
    const s = d.salarios?.get(e.id);
    hoja.addRow({
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

  // Listas desplegables en las filas de datos
  const ultimaFila = Math.max((d.colaboradores?.length || 0) + 1, 1) + 500;
  COLUMNAS.forEach((c, i) => {
    const rango = rangos[c.clave];
    if (!rango) return;
    const letra = hoja.getColumn(i + 1).letter;
    for (let r = 2; r <= ultimaFila; r++) {
      hoja.getCell(`${letra}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [rango],
        showErrorMessage: c.clave !== 'puesto' && c.clave !== 'area', // puesto/área: se permite escribir uno nuevo
        errorTitle: 'Valor no válido', error: `Elige un valor de la lista para "${c.encabezado}".`,
      };
    }
  });

  // Hoja de instrucciones
  instrucciones.columns = [{ header: 'Columna', key: 'c', width: 26 }, { header: '¿Obligatoria?', key: 'o', width: 22 }, { header: 'Cómo llenarla', key: 'a', width: 90 }, { header: 'Ejemplo', key: 'e', width: 28 }];
  instrucciones.getRow(1).font = { bold: true };
  instrucciones.addRow({ c: 'CÓMO FUNCIONA', a: 'Cada fila es un colaborador, identificado por su Email. Si el correo ya existe, se ACTUALIZA; si no, se CREA. Las celdas vacías NO borran datos existentes. Antes de aplicar verás exactamente qué cambia en cada persona.' });
  instrucciones.addRow({ c: '', a: `Moneda principal de la empresa: ${d.monedaPrincipal}. Los cambios de salario quedan en el historial con su fecha de vigencia.` });
  instrucciones.addRow({});
  COLUMNAS.forEach(c => instrucciones.addRow({
    c: c.encabezado,
    o: c.obligatoria === 'siempre' ? 'Sí' : c.obligatoria === 'crear' ? 'Solo para nuevos' : 'No',
    a: c.ayuda, e: c.ejemplo,
  }));
  instrucciones.getColumn('a').alignment = { wrapText: true, vertical: 'top' };

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = d.colaboradores?.length ? `Colaboradores_${new Date().toISOString().slice(0, 10)}.xlsx` : 'Plantilla_Colaboradores.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel con las filas que tuvieron errores y una columna "Errores", para corregir y volver a subir. */
export async function descargarErrores(encabezados: string[], filas: { celdas: string[]; errores: string[] }[]): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Colaboradores');
  hoja.addRow([...encabezados, 'Errores']).font = { bold: true };
  filas.forEach(f => hoja.addRow([...f.celdas, f.errores.join(' | ')]));
  hoja.getColumn(encabezados.length + 1).width = 80;
  hoja.getColumn(encabezados.length + 1).font = { color: { argb: 'FFB91C1C' } };
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Errores_importacion_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
