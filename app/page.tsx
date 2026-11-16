'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  AreaChart, Area as RechartsArea, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ExcelJS from 'exceljs'
import { estaActivo, type TipoPerfil, type Puesto, type Area, type Evaluacion, type Empleado, type Perfil, type FuncionesTarjeta, type Compensacion } from '@/lib/tipos'
import { PanelColaborador, type OpcionesGuardado } from '@/components/PanelColaborador'
import { payloadEmpleado, parsearMonto, type DatosColaborador, type DatosCompensacion } from '@/lib/colaboradores'
import { ModalDesvincularColaborador } from '@/components/ModalDesvincularColaborador'
import { SeccionDesvinculados } from '@/components/SeccionDesvinculados'
import { ArbolAreas } from '@/components/ArbolAreas'
import { ModalAccesos } from '@/components/ModalAccesos'
import { cargarDatosSesion, type RespuestaDatos, type EntradaDirectorio } from '@/lib/datos'
import type { Alcance } from '@/lib/alcance'
import { ReporteEvaluaciones } from '@/components/ReporteEvaluaciones'
import { HistorialEmpleado } from '@/components/HistorialEmpleado'
import { otorgarAccesos, sincronizarRol, type ResultadoOtorgar, revocarAcceso, restaurarAcceso, debeCambiarClave } from '@/lib/accesos'
import { construirJerarquia, filtrarJerarquia, idsDescendientes, coincideEmpleado, normalizarTexto } from '@/lib/jerarquia'
import { BotonLateral } from '@/components/BotonLateral'
import { VistaEvaluaciones360 } from '@/components/VistaEvaluaciones360'
import { construirArbol, NodoOrganigrama } from '@/components/Organigrama'
import { TarjetaSaludArea } from '@/components/TarjetaSaludArea'
import { TarjetaEmpleado } from '@/components/TarjetaEmpleado'
import { PanelBI } from '@/components/bi/PanelBI'
import { ProveedorUmbrales } from '@/lib/umbrales'
import { CONFIG_BI_DEFECTO, type UmbralesDesempeno } from '@/lib/bi'
import { ModalPerfilColaborador } from '@/components/ModalPerfilColaborador'
import { mensajeDeError } from '@/lib/errores'

export default function DashboardPerformance() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]) // solo activos
  const [empleadosDesvinculados, setEmpleadosDesvinculados] = useState<Empleado[]>([])
  const [empleadoEditando, setEmpleadoEditando] = useState<Empleado | null>(null)
  const [compensacionesEditando, setCompensacionesEditando] = useState<Compensacion[] | null>(null) // null = cargando
  const [monedaPreferida, setMonedaPreferida] = useState('COP')
  const [accesoRecienCreado, setAccesoRecienCreado] = useState<ResultadoOtorgar | null>(null)
  const [empleadoDesvinculando, setEmpleadoDesvinculando] = useState<Empleado | null>(null)
  const [busqueda, setBusqueda] = useState('') // buscador del header: filtra áreas y colaboradores
  const [areas, setAreas] = useState<Area[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  // Estados para el Modal de Invitaciones Inteligentes
  const [modalInvitarAbierto, setModalInvitarAbierto] = useState(false);
  // Estados para el Modal de Corte Oficial
  const [modalCorteAbierto, setModalCorteAbierto] = useState(false);
  const MESES_ANIO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const ANIOS_DISPONIBLES = [2025, 2026, 2027, 2028];

  const [mesCorte, setMesCorte] = useState<string>(MESES_ANIO[new Date().getMonth()]);
  const [anioCorte, setAnioCorte] = useState<number>(new Date().getFullYear());
  const [empleadoViendoPerfil, setEmpleadoViendoPerfil] = useState<Empleado | null>(null);
  const [fechaCortePeriodo, setFechaCortePeriodo] = useState(new Date().toISOString().split('T')[0]);
  const [ejecutandoCorte, setEjecutandoCorte] = useState(false);

  const periodosBloqueados = useMemo(() => {
    const mapa = new Map<string, { periodo: string; fecha: string; total: number }>();
    empleados.forEach(emp => {
      (emp.historico || []).forEach(h => {
        const actual = mapa.get(h.periodo);
        if (actual) {
          actual.total += 1;
        } else {
          mapa.set(h.periodo, { periodo: h.periodo, fecha: h.fecha_corte, total: 1 });
        }
      });
    });
    return Array.from(mapa.values()).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
  }, [empleados]);
  

  // Alcance de visibilidad (lib/alcance.ts) y directorio mínimo para el organigrama informativo
  const [alcance, setAlcance] = useState<Alcance | null>(null)
  const [directorio, setDirectorio] = useState<EntradaDirectorio[]>([])
  // Umbrales de desempeño de la empresa (configurables en el BI); los usan todas las pantallas
  const [umbrales, setUmbrales] = useState<UmbralesDesempeno>(CONFIG_BI_DEFECTO)
  const [vista, setVista] = useState<'tablero' | 'organigrama' | 'informes' | 'mi_perfil' | 'evaluaciones'>('tablero')

  const [nuevaAreaNombre, setNuevaAreaNombre] = useState(''); const [nuevaAreaPadre, setNuevaAreaPadre] = useState<string>("");
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [nuevosIndicadores, setNuevosIndicadores] = useState<{ [key: number]: string }>({});
  const [textosPlanes, setTextosPlanes] = useState<{ [key: number]: string }>({}); const [diasPlanes, setDiasPlanes] = useState<{ [key: number]: number }>({});
  const [planChatAbierto, setPlanChatAbierto] = useState<number | null>(null);
  const [nuevosComentarios, setNuevosComentarios] = useState<{ [key: number]: string }>({});
  const [nombreEmpresa, setNombreEmpresa] = useState('');

  const ROLES_DISPONIBLES: TipoPerfil[] = ['Admin', 'Manager', 'Líder de Área', 'Empleado', 'Auditor'];

  // Catálogo de Puestos
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [nuevoPuestoNombre, setNuevoPuestoNombre] = useState('');

  // Modal de Creación Individual de Colaborador
  const [modalNuevoEmpAbierto, setModalNuevoEmpAbierto] = useState(false);

  // Bandeja de Asignación en Bloque (Sin Área)
  const [seleccionadosSinArea, setSeleccionadosSinArea] = useState<number[]>([]);
  const [areaDestinoBloque, setAreaDestinoBloque] = useState<string>('');
  const [asignandoBloque, setAsignandoBloque] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [subiendoExcel, setSubiendoExcel] = useState(false);

  // Controla qué áreas están desplegadas en el tablero
const [areasAbiertas, setAreasAbiertas] = useState<{ [id: number]: boolean }>({});

const toggleArea = (id: number) => {
  setAreasAbiertas(prev => ({ ...prev, [id]: !prev[id] }));
};

  useEffect(() => { verificarUsuario() }, [])

  function calcularGantt(creado: string, limite: string) {
    const inicio = new Date(creado).getTime(); const fin = new Date(limite).getTime(); const hoy = new Date().getTime();
    const duracion = fin - inicio; const transcurrido = hoy - inicio;
    let avance = duracion > 0 ? (transcurrido / duracion) * 100 : 0;
    if (avance > 100) avance = 100; if (avance < 0) avance = 0;
    const dias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    return { porcentajeAvance: avance, diasRestantes: dias, fechaInicioStr: new Date(creado).toLocaleDateString('es-ES', opts), fechaFinStr: new Date(limite).toLocaleDateString('es-ES', opts), esVencido: dias < 0 };
  }

  
  async function verificarUsuario() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    // Primer ingreso con clave temporal: debe crear su propia contraseña antes de usar la plataforma
    if (debeCambiarClave(session.user.app_metadata)) { router.push('/actualizar-clave'); return }
    await cargarDatos(true)
    setLoading(false)
  }

  // Carga todo lo que el usuario puede ver. El servidor (/api/datos) aplica el alcance según la jerarquía de áreas.
  async function cargarDatos(inicial = false) {
    let datos: RespuestaDatos;
    try { datos = await cargarDatosSesion(); }
    catch (e) { alert(`No se pudieron cargar los datos: ${mensajeDeError(e)}`); return; }

    if (datos.estado === 'desvinculado') {
      // Un colaborador desvinculado conserva su histórico pero ya no puede entrar a la plataforma
      await supabase.auth.signOut()
      alert('Tu cuenta está desvinculada de la organización. Si crees que es un error, contacta a RRHH.')
      router.push('/login')
      return
    }
    if (datos.estado === 'sin_perfil') {
      alert('Tu usuario todavía no tiene un perfil asignado en la plataforma. Contacta a RRHH.')
      return
    }

    setPerfil(datos.perfil)
    setNombreEmpresa(datos.nombreEmpresa)
    setAreas(datos.areas)
    setPuestos(datos.puestos)
    setEvaluaciones(datos.evaluaciones)
    setDirectorio(datos.directorio)
    setAlcance(datos.alcance)
    if (datos.monedaPreferida) setMonedaPreferida(datos.monedaPreferida)
    if (datos.umbrales) setUmbrales(datos.umbrales)

    // Toda la plataforma (tableros, BI, organigrama, invitaciones) trabaja solo con activos;
    // los desvinculados (solo los recibe el Admin) se guardan aparte para el histórico.
    const activos = datos.empleados.filter(estaActivo)
    setEmpleadosDesvinculados(datos.empleados.filter(e => !estaActivo(e)))
    // Equipo visible: Admin/Auditor toda la empresa; el resto su equipo (y él mismo si pertenece a un área a su cargo)
    const areasDelAlcance = new Set(datos.alcance.areasIds)
    const miId = datos.miEmpleado?.id
    setEmpleados(datos.alcance.tipo === 'empresa'
      ? activos
      : activos.filter(e => e.id !== miId || (e.area_id !== null && areasDelAlcance.has(e.area_id))))
    setMiDesempeno(datos.miEmpleado)

    if (inicial) setVista(datos.alcance.tipo === 'personal' ? 'mi_perfil' : 'tablero')
  }

  const recargarDatos = () => { cargarDatos() }

// 1. Guarda/actualiza automáticamente el punto del mes actual al calificar KPIs
  async function registrarSnapshotMensual(eid: number, cumplimiento: number, potencial: number, totalKpis: number) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const ahora = new Date();
    const periodoActual = `${meses[ahora.getMonth()]} ${ahora.getFullYear()}`;

    await supabase.from('historico_cumplimiento').upsert(
      {
        empleado_id: eid,
        empresa_id: perfil?.empresa_id,
        periodo: periodoActual,
        cumplimiento,
        potencial_score: potencial,
        total_kpis: totalKpis,
        fecha_corte: ahora.toISOString(),
      },
      { onConflict: 'empleado_id, periodo' }
    );
  }

  // 2. Formaliza un corte oficial masivo para toda la organización (Botón Admin)
  async function ejecutarCorteOficial() {
    const etiqueta = `${mesCorte} ${anioCorte}`;
    if (!mesCorte || !anioCorte || !fechaCortePeriodo) {
      alert("Debes seleccionar el mes, el año y la fecha de bloqueo.");
      return;
    }

    const yaBloqueado = periodosBloqueados.some(
      p => p.periodo.toLowerCase() === etiqueta.toLowerCase()
    );
    if (yaBloqueado) {
      alert(`🔒 El periodo "${etiqueta}" ya se encuentra bloqueado.`);
      return;
    }

    const confirmar = window.confirm(
      `¿Deseas bloquear el periodo "${etiqueta}" con fecha ${fechaCortePeriodo} para ${empleados.length} colaboradores?`
    );
    if (!confirmar) return;

    setEjecutandoCorte(true);
    const fechaISO = new Date(`${fechaCortePeriodo}T12:00:00`).toISOString();

    const snapshots = empleados.map(emp => ({
      empleado_id: emp.id,
      empresa_id: perfil?.empresa_id,
      periodo: etiqueta,
      cumplimiento: emp.cumplimiento_general || 0,
      potencial_score: emp.potencial_score || 1,
      total_kpis: emp.indicadores?.length || 0,
      fecha_corte: fechaISO
    }));

    const { error } = await supabase
      .from('historico_cumplimiento')
      .upsert(snapshots, { onConflict: 'empleado_id, periodo' });

    setEjecutandoCorte(false);
    if (error) {
      alert("Error al bloquear el periodo: " + error.message);
    } else {
      alert(`🔒 Periodo "${etiqueta}" bloqueado con fecha ${fechaCortePeriodo}.`);
      recargarDatos();
    }
  }

  const descargarPlantilla = async () => {
    // 1. Consultar catálogos frescos desde Supabase para asegurar datos al día
    const [{ data: puestosDB }, { data: areasDB }] = await Promise.all([
      supabase.from('puestos').select('*').eq('empresa_id', perfil?.empresa_id).order('nombre', { ascending: true }),
      supabase.from('areas').select('*').eq('empresa_id', perfil?.empresa_id).order('nombre', { ascending: true }),
    ]);

    const puestosLista = puestosDB || puestos;
    const areasLista = areasDB || areas;

    if (puestosLista.length === 0) {
      alert("⚠️ No tienes Puestos de Trabajo creados.\n\nCrea al menos un puesto en el panel 'Nuevo Puesto de Trabajo' antes de descargar la plantilla para que aparezca la lista desplegable.");
      return;
    }

    if (areasLista.length === 0) {
      alert("⚠️ No tienes Áreas creadas.\n\nCrea al menos un área antes de descargar la plantilla.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Colaboradores');
    const catalogSheet = workbook.addWorksheet('Catalogos');
    catalogSheet.state = 'veryHidden';

    // 2. Poblar hoja oculta con los catálogos oficiales
    puestosLista.forEach((p, idx) => { catalogSheet.getCell(`A${idx + 1}`).value = p.nombre; });
    areasLista.forEach((a, idx) => { catalogSheet.getCell(`B${idx + 1}`).value = a.nombre; });
    ROLES_DISPONIBLES.forEach((r, idx) => { catalogSheet.getCell(`C${idx + 1}`).value = r; });

    sheet.columns = [
      { header: 'Nombre', key: 'nombre', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Puesto', key: 'puesto', width: 26 },
      { header: 'Area', key: 'area', width: 24 },
      { header: 'Tipo de Perfil', key: 'tipo_perfil', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    // 3. Aplicar listas desplegables reales en Puesto (C), Area (D) y Tipo de Perfil (E)
    for (let row = 2; row <= 200; row++) {
      sheet.getCell(`C${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`Catalogos!$A$1:$A$${puestosLista.length}`],
        showErrorMessage: true,
        errorTitle: 'Puesto inválido',
        error: 'Selecciona un puesto disponible en la lista.'
      };

      sheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Catalogos!$B$1:$B$${areasLista.length}`],
        showErrorMessage: true,
        errorTitle: 'Área inválida',
        error: 'Selecciona un área previamente creada en la plataforma.'
      };

      sheet.getCell(`E${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`Catalogos!$C$1:$C$${ROLES_DISPONIBLES.length}`],
        showErrorMessage: true,
        errorTitle: 'Perfil inválido',
        error: 'Selecciona un tipo de perfil válido.'
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Plantilla_Carga_Colaboradores.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || subiendoExcel) return;

    setSubiendoExcel(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];

        // Consultar correos actuales directamente desde Supabase para evitar datos desactualizados
        const { data: existentesDB } = await supabase
          .from('empleados')
          .select('email')
          .eq('empresa_id', perfil?.empresa_id);

        const correosEnSistema = new Set(
          (existentesDB || []).map(emp => emp.email.trim().toLowerCase())
        );
        const correosEnArchivo = new Set<string>();
        const areasConLiderEnArchivo = new Set<number>();

        interface FilaValidada {
          nombre: string;
          email: string;
          puestoNombre: string;
          puestoId: number;
          areaId: number | null;
          tipoPerfil: TipoPerfil;
        }
        const registrosValidos: FilaValidada[] = [];
        const errores: string[] = [];

        rows.forEach((row, index) => {
          const numFila = index + 2;
          const nombreVal = String(row['Nombre'] || '').trim();
          const emailVal = String(row['Email'] || '').trim().toLowerCase();
          const puestoVal = String(row['Puesto'] || '').trim();
          const areaVal = String(row['Area'] || '').trim();
          const perfilVal = String(row['Tipo de Perfil'] || '').trim();

          // Ignorar filas completamente vacías
          if (!nombreVal && !emailVal && !puestoVal && !areaVal && !perfilVal) return;

          if (!nombreVal) errores.push(`Fila ${numFila}: Falta el 'Nombre'.`);

          if (!emailVal || !emailVal.includes('@')) {
            errores.push(`Fila ${numFila}: 'Email' inválido o vacío.`);
          } else if (correosEnSistema.has(emailVal)) {
            errores.push(`Fila ${numFila}: El email "${emailVal}" ya existe en la plataforma.`);
          } else if (correosEnArchivo.has(emailVal)) {
            errores.push(`Fila ${numFila}: El email "${emailVal}" está duplicado dentro del Excel.`);
          } else {
            correosEnArchivo.add(emailVal);
          }

          const puestoMatch = puestos.find(p => p.nombre.toLowerCase() === puestoVal.toLowerCase());
          if (!puestoVal || !puestoMatch) {
            errores.push(`Fila ${numFila}: El puesto "${puestoVal || 'Vacío'}" no existe en el catálogo.`);
          }

          let areaMatch: Area | undefined;
          if (areaVal) {
            areaMatch = areas.find(a => a.nombre.toLowerCase() === areaVal.toLowerCase());
            if (!areaMatch) {
              errores.push(`Fila ${numFila}: El área "${areaVal}" no está creada en la plataforma.`);
            }
          }

          const rolMatch = ROLES_DISPONIBLES.find(r => r.toLowerCase() === perfilVal.toLowerCase());
          if (!perfilVal || !rolMatch) {
            errores.push(`Fila ${numFila}: Tipo de perfil "${perfilVal || 'Vacío'}" no válido.`);
          }

          if (rolMatch === 'Líder de Área') {
            if (!areaMatch) {
              errores.push(`Fila ${numFila}: El perfil 'Líder de Área' requiere especificar un Área válida.`);
            } else if (areaMatch.lider_id !== null) {
              errores.push(`Fila ${numFila}: El área "${areaMatch.nombre}" ya tiene un líder asignado.`);
            } else if (areasConLiderEnArchivo.has(areaMatch.id)) {
              errores.push(`Fila ${numFila}: Hay más de un 'Líder de Área' para "${areaMatch.nombre}" en el archivo.`);
            } else {
              areasConLiderEnArchivo.add(areaMatch.id);
            }
          }

          if (puestoMatch && rolMatch) {
            registrosValidos.push({
              nombre: nombreVal,
              email: emailVal,
              puestoNombre: puestoMatch.nombre,
              puestoId: puestoMatch.id,
              areaId: areaMatch ? areaMatch.id : null,
              tipoPerfil: rolMatch
            });
          }
        });

        if (errores.length > 0) {
          alert(
            `⛔ Carga rechazada. Se encontraron ${errores.length} error(es):\n\n` +
            errores.slice(0, 12).join('\n') +
            (errores.length > 12 ? `\n...y ${errores.length - 12} más.` : '')
          );
          return;
        }

        if (registrosValidos.length === 0) {
          alert("El archivo no contiene filas válidas para importar.");
          return;
        }

        // Inserción única en bloque
        const payload = registrosValidos.map(reg => ({
          nombre: reg.nombre,
          email: reg.email,
          puesto: reg.puestoNombre,
          puesto_id: reg.puestoId,
          area_id: reg.areaId,
          tipo_perfil: reg.tipoPerfil,
          cumplimiento_general: 0,
          empresa_id: perfil?.empresa_id
        }));

        const { data: insertados, error: insertError } = await supabase
          .from('empleados')
          .insert(payload)
          .select();

        if (insertError) {
          alert("Error al importar colaboradores: " + insertError.message);
          return;
        }

        // Vincular líderes de área si aplica
        if (insertados) {
          for (const empCreado of insertados) {
            const regOriginal = registrosValidos.find(r => r.email === empCreado.email.toLowerCase());
            if (regOriginal?.tipoPerfil === 'Líder de Área' && regOriginal.areaId) {
              await supabase.from('areas').update({ lider_id: empCreado.id }).eq('id', regOriginal.areaId);
            }
          }
        }

        alert(`✅ Carga exitosa: ${registrosValidos.length} colaborador(es) importado(s).`);
        recargarDatos();
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSubiendoExcel(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  async function crearArea() {
    if (!nuevaAreaNombre) return;
    const nombreLimpio = nuevaAreaNombre.trim();
    const { data: areaExistente } = await supabase
      .from('areas')
      .select('id')
      .ilike('nombre', nombreLimpio)
      .eq('empresa_id', perfil?.empresa_id)
      .single();
    if (areaExistente) { alert(`El área "${nombreLimpio}" ya existe en tu organización.`); return; }
    const { error } = await supabase.from('areas').insert([{ nombre: nombreLimpio, parent_id: nuevaAreaPadre ? parseInt(nuevaAreaPadre) : null, empresa_id: perfil?.empresa_id }]);
    if (error) { alert("Hubo un error al crear el área. Intenta de nuevo."); console.error(error); }
    else { alert(`¡Área "${nombreLimpio}" creada con éxito!`); setNuevaAreaNombre(''); recargarDatos(); }
  }
  async function crearPuesto() {
    const nombreLimpio = nuevoPuestoNombre.trim();
    if (!nombreLimpio) return;

    const existe = puestos.some(p => p.nombre.toLowerCase() === nombreLimpio.toLowerCase());
    if (existe) {
      alert(`El puesto "${nombreLimpio}" ya existe en el catálogo.`);
      return;
    }

    const { error } = await supabase
      .from('puestos')
      .insert([{ nombre: nombreLimpio, empresa_id: perfil?.empresa_id }]);

    if (error) {
      alert("Error al crear puesto: " + error.message);
    } else {
      setNuevoPuestoNombre('');
      recargarDatos();
    }
  }

  // Crea un puesto desde el panel del colaborador y lo deja disponible de inmediato
  async function crearPuestoRapido(nombrePuesto: string): Promise<Puesto | null> {
    const nombreLimpio = nombrePuesto.trim();
    const existente = puestos.find(p => normalizarTexto(p.nombre) === normalizarTexto(nombreLimpio));
    if (existente) return existente;
    const { data, error } = await supabase.from('puestos')
      .insert([{ nombre: nombreLimpio, empresa_id: perfil?.empresa_id }]).select().single();
    if (error || !data) { alert('Error al crear puesto: ' + (error?.message || 'desconocido')); return null; }
    setPuestos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    return data;
  }

  // Registra un salario nuevo en el historial (tabla protegida: solo Admin)
  async function registrarCompensacion(empleadoId: number, comp: DatosCompensacion): Promise<boolean> {
    const monto = parsearMonto(comp.salario);
    if (!comp.salario.trim() || monto === null) return true; // sin cambios de salario
    const { error } = await supabase.from('compensaciones').insert([{
      empleado_id: empleadoId, empresa_id: perfil?.empresa_id, salario: monto, moneda: comp.moneda,
      periodicidad: comp.periodicidad, fecha_vigencia: comp.fecha_vigencia, motivo: comp.motivo.trim() || null,
    }]);
    if (error) { alertaErrorSupabase('guardar el salario', error); return false; }
    setMonedaPreferida(comp.moneda);
    return true;
  }

  async function crearColaborador(datos: DatosColaborador, comp: DatosCompensacion, opciones: OpcionesGuardado): Promise<boolean> {
    const areaSeleccionada = datos.area_id ? areas.find(a => a.id === parseInt(datos.area_id)) : undefined;
    if (datos.tipo_perfil === 'Líder de Área' && areaSeleccionada?.lider_id) {
      const liderActual = empleados.find(emp => emp.id === areaSeleccionada.lider_id);
      alert(`⛔ El área "${areaSeleccionada.nombre}" ya tiene un líder asignado (${liderActual?.nombre || 'Asignado'}).`);
      return false;
    }

    const { data: nuevoEmp, error } = await supabase
      .from('empleados')
      .insert([{
        ...payloadEmpleado(datos, puestos),
        email: datos.email.trim().toLowerCase(),
        cumplimiento_general: 0,
        empresa_id: perfil?.empresa_id,
      }])
      .select()
      .single();
    if (error || !nuevoEmp) { alertaErrorSupabase('registrar al colaborador', error || { message: 'sin respuesta' }); return false; }

    // Si es Líder de Área, se vincula como líder del área
    if (datos.tipo_perfil === 'Líder de Área' && areaSeleccionada) {
      await supabase.from('areas').update({ lider_id: nuevoEmp.id }).eq('id', areaSeleccionada.id);
    }

    // El colaborador ya quedó creado: los pasos siguientes avisan si fallan, pero no lo deshacen
    await registrarCompensacion(nuevoEmp.id, comp);
    if (opciones.darAcceso) {
      try {
        const resultado = await otorgarAccesos([nuevoEmp.id]);
        setAccesoRecienCreado(resultado);
      } catch (e) {
        alert(`${nuevoEmp.nombre} quedó registrado, pero no se pudo generar su acceso:\n${mensajeDeError(e)}\n\nPuedes hacerlo luego desde "Dar Acceso".`);
      }
    }

    recargarDatos();
    return true;
  }

  async function asignarAreaEnBloque() {
    if (seleccionadosSinArea.length === 0 || !areaDestinoBloque) {
      alert("Selecciona al menos un colaborador y un área de destino.");
      return;
    }
    setAsignandoBloque(true);
    const { error } = await supabase
      .from('empleados')
      .update({ area_id: parseInt(areaDestinoBloque) })
      .in('id', seleccionadosSinArea);

    setAsignandoBloque(false);
    if (error) {
      alert("Error al asignar en bloque: " + error.message);
    } else {
      setSeleccionadosSinArea([]);
      setAreaDestinoBloque('');
      recargarDatos();
    }
  }
  async function asignarPadreArea(aid: number, pid: string) {
    const npid = pid === "" ? null : parseInt(pid);
    if (npid === aid) return;
    // Evita ciclos: un área no puede depender de una de sus propias sub-áreas
    if (npid !== null && idsDescendientes(aid, areas).has(npid)) {
      alert('⛔ Un área no puede depender de una de sus propias sub-áreas.');
      return;
    }
    await supabase.from('areas').update({ parent_id: npid }).eq('id', aid);
    recargarDatos();
  }
  async function asignarLiderArea(aid: number, lid: string) { await supabase.from('areas').update({ lider_id: lid === "" ? null : parseInt(lid) }).eq('id', aid); recargarDatos(); }
  async function asignarAreaEmpleado(eid: number, aid: string) { await supabase.from('empleados').update({ area_id: aid === "" ? null : parseInt(aid) }).eq('id', eid); recargarDatos(); }

  // ==========================================
  // GESTIÓN DE COLABORADORES Y ÁREAS (ADMIN)
  // ==========================================

  // Mensaje claro si la columna de estado todavía no existe en Supabase
  function alertaErrorSupabase(accion: string, error: { message: string }) {
    const faltaMigracion = /column|relation|schema cache/i.test(error.message) &&
      /estado_contratacion|desvinculacion|compensaciones|tipo_documento|numero_documento|fecha_ingreso|jefe_directo|sede|tipo_contrato|modalidad|jornada|centro_costo|email_personal|fecha_nacimiento|telefono/.test(error.message);
    const documentoDuplicado = /empleados_documento_unico_idx/.test(error.message);
    alert(faltaMigracion
      ? `No se pudo ${accion}: falta aplicar una migración en Supabase (ver carpeta supabase/migrations).`
      : documentoDuplicado
        ? `No se pudo ${accion}: ese documento ya está registrado para otro colaborador.`
        : `No se pudo ${accion}: ${error.message}`);
  }

  async function guardarEdicionColaborador(emp: Empleado, datos: DatosColaborador, comp: DatosCompensacion): Promise<boolean> {
    const cambiaTipoPerfil = (emp.tipo_perfil || 'Empleado') !== datos.tipo_perfil;
    if (cambiaTipoPerfil && emp.email.trim().toLowerCase() === perfil?.email?.trim().toLowerCase()) {
      alert('⛔ No puedes cambiar tu propio tipo de perfil: perderías tus permisos de administración. Pídeselo a otro Admin.');
      return false;
    }
    const payload = payloadEmpleado(datos, puestos);
    const areaNueva = payload.area_id ? areas.find(a => a.id === payload.area_id) : undefined;
    const areasQueLidera = areas.filter(a => a.lider_id === emp.id);

    // Validación de Líder de Área (mismas reglas que al crear)
    if (datos.tipo_perfil === 'Líder de Área' && areaNueva?.lider_id && areaNueva.lider_id !== emp.id) {
      const liderActual = empleados.find(e => e.id === areaNueva.lider_id);
      alert(`⛔ El área "${areaNueva.nombre}" ya tiene un líder asignado (${liderActual?.nombre || 'Asignado'}).`);
      return false;
    }

    // Áreas que pierden a su líder: deja de ser 'Líder de Área', o se mueve fuera del área que lideraba
    const dejaDeSerLider = emp.tipo_perfil === 'Líder de Área' && datos.tipo_perfil !== 'Líder de Área'
      && datos.tipo_perfil !== 'Manager' && datos.tipo_perfil !== 'Admin';
    const areasQuePierdenLider = areasQueLidera.filter(a =>
      dejaDeSerLider || (a.id === emp.area_id && a.id !== payload.area_id)
    );
    if (areasQuePierdenLider.length > 0 && !window.confirm(
      `${emp.nombre} dejará de liderar: ${areasQuePierdenLider.map(a => a.nombre).join(', ')}.\n\n¿Continuar?`
    )) return false;

    const { error } = await supabase.from('empleados').update(payload).eq('id', emp.id);
    if (error) { alertaErrorSupabase('guardar los cambios', error); return false; }

    if (areasQuePierdenLider.length > 0) {
      await supabase.from('areas').update({ lider_id: null }).in('id', areasQuePierdenLider.map(a => a.id));
    }
    if (datos.tipo_perfil === 'Líder de Área' && areaNueva && areaNueva.lider_id !== emp.id) {
      await supabase.from('areas').update({ lider_id: emp.id }).eq('id', areaNueva.id);
    }

    await registrarCompensacion(emp.id, comp);

    // El tipo de perfil define los permisos: si ya tiene cuenta, se actualiza su rol de acceso
    if (cambiaTipoPerfil && emp.user_id) {
      try { await sincronizarRol(emp.id); }
      catch (e) {
        alert(`Los datos se guardaron, pero no se pudieron actualizar sus permisos de acceso:\n${mensajeDeError(e)}`);
      }
    }

    recargarDatos();
    return true;
  }

  // Abre el panel de edición y, si es Admin, carga el historial de salarios
  async function abrirEdicionColaborador(emp: Empleado) {
    setEmpleadoEditando(emp);
    setCompensacionesEditando(null);
    const { data, error } = await supabase.from('compensaciones').select('*')
      .eq('empleado_id', emp.id).order('fecha_vigencia', { ascending: false }).order('created_at', { ascending: false });
    setCompensacionesEditando(error ? [] : (data as Compensacion[]));
  }

  async function desvincularColaborador(emp: Empleado, fecha: string, motivo: string): Promise<boolean> {
    if (emp.email.trim().toLowerCase() === perfil?.email?.trim().toLowerCase()) {
      alert('⛔ No puedes desvincularte a ti mismo. Pídeselo a otro Admin.');
      return false;
    }
    // Se conserva area_id para saber dónde estaba; solo se libera el liderazgo de sus áreas
    const { error } = await supabase.from('empleados').update({
      estado_contratacion: 'desvinculado',
      fecha_desvinculacion: fecha,
      motivo_desvinculacion: motivo,
    }).eq('id', emp.id);
    if (error) { alertaErrorSupabase('desvincular al colaborador', error); return false; }

    const areasQueLidera = areas.filter(a => a.lider_id === emp.id).map(a => a.id);
    if (areasQueLidera.length > 0) {
      await supabase.from('areas').update({ lider_id: null }).in('id', areasQueLidera);
    }
    // Bloquea su inicio de sesión en Supabase (no solo en la app)
    if (emp.user_id) {
      try { await revocarAcceso(emp.id); }
      catch (e) { alert(`Quedó desvinculado, pero no se pudo bloquear su cuenta de acceso:\n${mensajeDeError(e)}`); }
    }
    setEmpleadoEditando(null);
    recargarDatos();
    return true;
  }

  async function reactivarColaborador(emp: Empleado) {
    const areaPrevia = areas.find(a => a.id === emp.area_id);
    if (!window.confirm(
      `¿Reactivar a ${emp.nombre}?\n\nVolverá a aparecer en la plataforma${areaPrevia ? ` en el área "${areaPrevia.nombre}"` : ' (sin área asignada)'} con todo su histórico, y podrá volver a entrar.`
    )) return;
    const { error } = await supabase.from('empleados').update({
      estado_contratacion: 'activo',
      fecha_desvinculacion: null,
      motivo_desvinculacion: null,
    }).eq('id', emp.id);
    if (error) { alertaErrorSupabase('reactivar al colaborador', error); return; }
    if (emp.user_id) {
      try { await restaurarAcceso(emp.id); }
      catch (e) { alert(`Quedó reactivado, pero no se pudo desbloquear su cuenta de acceso:\n${mensajeDeError(e)}`); }
    }
    recargarDatos();
  }

  async function renombrarArea(aid: number, nombreNuevo: string): Promise<boolean> {
    const nombreLimpio = nombreNuevo.trim();
    if (!nombreLimpio) { alert('El nombre del área no puede estar vacío.'); return false; }
    if (areas.some(a => a.id !== aid && a.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase())) {
      alert(`Ya existe un área llamada "${nombreLimpio}".`);
      return false;
    }
    const { error } = await supabase.from('areas').update({ nombre: nombreLimpio }).eq('id', aid);
    if (error) { alert('No se pudo renombrar el área: ' + error.message); return false; }
    recargarDatos();
    return true;
  }

  async function eliminarArea(area: Area) {
    const activos = empleados.filter(e => e.area_id === area.id);
    const subAreas = areas.filter(a => a.parent_id === area.id);
    if (activos.length > 0 || subAreas.length > 0) {
      alert(
        `⛔ No se puede eliminar "${area.nombre}" todavía:\n\n` +
        (activos.length > 0 ? `• Tiene ${activos.length} colaborador(es) activo(s). Muévelos a otra área.\n` : '') +
        (subAreas.length > 0 ? `• Tiene sub-áreas que dependen de ella: ${subAreas.map(a => a.nombre).join(', ')}. Cámbiales el "Depende de".\n` : '')
      );
      return;
    }
    const exMiembros = empleadosDesvinculados.filter(e => e.area_id === area.id);
    if (!window.confirm(
      `¿Eliminar definitivamente el área "${area.nombre}"?` +
      (exMiembros.length > 0 ? `\n\n${exMiembros.length} colaborador(es) desvinculado(s) figuraban en esta área; quedarán "sin área" pero conservan su histórico.` : '')
    )) return;

    if (exMiembros.length > 0) {
      const { error } = await supabase.from('empleados').update({ area_id: null }).in('id', exMiembros.map(e => e.id));
      if (error) { alert('No se pudo liberar el área: ' + error.message); return; }
    }
    const { error } = await supabase.from('areas').delete().eq('id', area.id);
    if (error) { alert('No se pudo eliminar el área: ' + error.message); return; }
    recargarDatos();
  }

  async function agregarIndicador(eid: number, datosKpi: any) {
  if (!datosKpi.titulo) return;
  await supabase.from('indicadores').insert([{ 
    empleado_id: eid, 
    titulo: datosKpi.titulo, 
    descripcion: datosKpi.descripcion,
    unidad_medida: datosKpi.unidad_medida,
    meta_esperada: datosKpi.meta_esperada,
    direccion: datosKpi.direccion || 'creciente',
    periodo: datosKpi.periodo || 'trimestral', // <-- Guardado de periodo
    progreso: 0,
    resultado_actual: 0
  }]);
  recargarDatos();
}

  // Asegúrate de que eliminarIndicador esté definida correctamente (ya tenías un borrador, asegúrate de que sea este)
  async function eliminarIndicador(id: number) {
    const confirmar = window.confirm("¿Seguro que deseas eliminar este indicador?");
    if (!confirmar) return;

    const { error } = await supabase.from('indicadores').delete().eq('id', id);
    if (error) { alert("Error al eliminar: " + error.message); } 
    else { alert("Indicador eliminado."); recargarDatos(); }
  }

  async function actualizarIndicador(id: number, val: number, eid: number) {
    const targetList = empleados;
    const setter = setEmpleados;
    let nuevoPromedioCalculado = 0;

    const updatedList = targetList.map(emp => {
      if (emp.id === eid) {
        const nuevosIndicadoresEmp = emp.indicadores?.map((i: any) => {
          if (i.id === id) {
            const metaReal = i.meta_esperada && i.meta_esperada > 0 ? i.meta_esperada : 1;
            let porcentajeCalculado = 0;

            if (i.direccion === 'decreciente') {
              // LÓGICA INVERSA (Menos es mejor)
              if (val <= 0) {
                porcentajeCalculado = 0; 
              } else if (val <= metaReal) {
                porcentajeCalculado = 100; // Si demora menos que la meta = 100% éxito
              } else {
                porcentajeCalculado = Math.round((metaReal / val) * 100); // Pierde puntos al pasarse
              }
            } else {
              // LÓGICA DIRECTA (Más es mejor)
              porcentajeCalculado = Math.round((val / metaReal) * 100);
            }

            if (porcentajeCalculado > 100) porcentajeCalculado = 100;
            if (porcentajeCalculado < 0) porcentajeCalculado = 0;

            return { ...i, resultado_actual: val, progreso: porcentajeCalculado };
          }
          return i;
        }) || [];

        const suma = nuevosIndicadoresEmp.reduce((acc: any, curr: any) => acc + curr.progreso, 0);
        const nuevoPromedio = nuevosIndicadoresEmp.length > 0 ? Math.round(suma / nuevosIndicadoresEmp.length) : 0;
        nuevoPromedioCalculado = nuevoPromedio;
        
        return { ...emp, indicadores: nuevosIndicadoresEmp, cumplimiento_general: nuevoPromedio };
      }
      return emp;
    });

    setter(updatedList);

    const kpiActualizado = updatedList.find(e => e.id === eid)?.indicadores?.find(i => i.id === id);
    const progresoGuardar = kpiActualizado ? kpiActualizado.progreso : 0;

    await supabase.from('indicadores').update({ resultado_actual: val, progreso: progresoGuardar }).eq('id', id);
    await supabase.from('empleados').update({ cumplimiento_general: nuevoPromedioCalculado }).eq('id', eid);

    // --- NUEVO: Actualiza el punto histórico del mes actual en tiempo real ---
    const empActualizado = updatedList.find(e => e.id === eid);
    if (empActualizado) {
      await registrarSnapshotMensual(
        eid,
        nuevoPromedioCalculado,
        empActualizado.potencial_score || 1,
        empActualizado.indicadores?.length || 0
      );
    }
  }

  async function guardarEvaluacionPotencial(eid: number, puntajeFinal: number, nivel: 1 | 2 | 3, justificacion: string, dimensiones: any) {
    const targetList = empleados;
    const setter = setEmpleados;
    
    // Usamos el ID numérico del empleado evaluador si existe, o null
    const evaluadorIdNumerico = miDesempeno?.id || null;

    const { error } = await supabase.from('evaluaciones_potencial').insert([{
      empleado_id: eid,
      evaluador_id: evaluadorIdNumerico,
      scores_dimensiones: dimensiones,
      puntaje_obtenido: puntajeFinal,
      nivel_resultado: nivel,
      justificacion: justificacion
    }]);

    if (error) {
      console.error("Error al registrar evaluación de potencial:", error);
      alert("Hubo un error al guardar en base de datos: " + error.message);
      return;
    }

    // Actualiza la tarjeta localmente para sincronizar el Nine-Box al instante
    setter(targetList.map(emp =>
      emp.id === eid ? { ...emp, potencial_score: nivel } : emp
    ));
    await supabase.from('empleados').update({ potencial_score: nivel }).eq('id', eid);
    
    alert("✅ Evaluación de potencial guardada exitosamente.");
    recargarDatos();
  }

  // --- FUNCIÓN 2: GUARDAR FEEDBACK EN EL KPI ---
  async function guardarFeedbackKPI(kpiId: number, eid: number, feedback: string) {
    const targetList = empleados;
    const setter = setEmpleados;

    const fechaActual = new Date().toISOString();

    const updatedList = targetList.map(emp => {
      if (emp.id === eid) {
        const nuevosInds = emp.indicadores?.map(i => i.id === kpiId ? { ...i, feedback_lider: feedback, fecha_feedback: fechaActual } : i) || [];
        return { ...emp, indicadores: nuevosInds };
      }
      return emp;
    });

    setter(updatedList);
    await supabase.from('indicadores').update({ feedback_lider: feedback, fecha_feedback: fechaActual }).eq('id', kpiId);
  }

  async function crearPlan(eid: number) { const txt = textosPlanes[eid]; if (!txt) return; const lim = new Date(); lim.setDate(lim.getDate() + (diasPlanes[eid] || 7)); await supabase.from('planes_mejora').insert([{ empleado_id: eid, compromiso: txt, created_at: new Date().toISOString(), fecha_limite: lim.toISOString(), estado: 'pendiente' }]); setTextosPlanes({ ...textosPlanes, [eid]: '' }); recargarDatos(); }
  async function completarPlan(pid: number, est: string) { await supabase.from('planes_mejora').update({ estado: est === 'pendiente' ? 'completado' : 'pendiente' }).eq('id', pid); recargarDatos(); }

  async function enviarComentario(pid: number) {
    const texto = nuevosComentarios[pid];
    if (!texto) return;
    await supabase.from('comentarios').insert([{ plan_id: pid, autor: perfil!.nombre, texto }]);
    setNuevosComentarios({ ...nuevosComentarios, [pid]: '' });
    recargarDatos();
  }

  async function guardarEvaluacion(evaluadoId: number, tipo: string, puntuacion: number, feedback: string) {
    if (!miDesempeno) return; if (puntuacion === 0) return alert("Selecciona una puntuación"); if (feedback.trim() === '') return alert("Escribe un comentario");
    await supabase.from('evaluaciones').insert([{ evaluador_id: miDesempeno.id, evaluado_id: evaluadoId, tipo, puntuacion, feedback, empresa_id: perfil?.empresa_id }]);
    alert("Evaluación enviada"); recargarDatos();
  }

  async function actualizarDescripcionPuesto(eid: number, desc: string) {
  const targetList = empleados;
  const setter = setEmpleados;

  setter(targetList.map(e => e.id === eid ? { ...e, descripcion_puesto: desc } : e));
  await supabase.from('empleados').update({ descripcion_puesto: desc }).eq('id', eid);
}

// FUNCIÓN PARA ELIMINAR UN PLAN DE MEJORA
  async function calificarIndicador(indicadorId: number, resultadoObtenido: number) {
    const { error } = await supabase
      .from('indicadores')
      .update({ resultado_actual: resultadoObtenido })
      .eq('id', indicadorId);

    if (error) {
      alert("Error al guardar la calificación: " + error.message);
    } else {
      alert("Calificación guardada exitosamente.");
      recargarDatos();
    }
  }
  // Dar acceso a la plataforma (clave temporal). La lógica vive en /api/accesos (servidor).
  function abrirModalInvitacion() {
    if (empleados.filter(emp => emp.email !== perfil?.email).length === 0) {
      alert("No hay colaboradores en la plataforma para dar acceso.");
      return;
    }
    setModalInvitarAbierto(true);
  }

  const esAdmin = perfil?.rol === 'admin';
  const esAuditor = perfil?.rol === 'auditor';
  // Alcance por jerarquía (calculado en el servidor, ver lib/alcance.ts)
  const tieneEquipo = alcance?.tipo === 'equipo';
  const directosIds = useMemo(() => new Set(alcance?.directosIds ?? []), [alcance]);
  const areasDelAlcance = useMemo(() => new Set(alcance?.areasIds ?? []), [alcance]);
  const esLider = directosIds.size > 0;

  // Función central que decide si el usuario actual puede editar/crear/eliminar datos de un colaborador:
  // Admin a todos; Auditor a nadie; el resto solo a sus reportes directos (la cascada es de solo lectura)
  const puedeEditarColaborador = (emp: Empleado): boolean => {
    if (esAdmin) return true;
    if (esAuditor) return false;
    return directosIds.has(emp.id);
  };

  // Dataset para métricas de BI: toda la empresa (Admin/Auditor) o solo el equipo asignado (sin incluirse a sí mismo)
  const dataParaMetricas = useMemo(
    () => (esAdmin || esAuditor) ? empleados : empleados.filter(e => e.id !== miDesempeno?.id),
    [esAdmin, esAuditor, empleados, miDesempeno]
  );

  // Áreas visibles en el tablero: todas (Admin/Auditor) o las que lidera + sus sub-áreas
  const areasVisibles = useMemo(
    () => alcance?.tipo === 'empresa' ? areas : areas.filter(a => areasDelAlcance.has(a.id)),
    [alcance, areas, areasDelAlcance]
  );
  // Miembros del equipo que no están en un área a su cargo (p. ej. le reportan como jefe directo desde otra área)
  const reportesFueraDeArea = alcance?.tipo === 'equipo'
    ? empleados.filter(e => e.id !== miDesempeno?.id && !(e.area_id !== null && areasDelAlcance.has(e.area_id)))
    : [];

  // Árbol jerárquico de áreas (según "Depende de") y su versión filtrada por el buscador
  const consultaBusqueda = normalizarTexto(busqueda);
  const jerarquiaAreas = useMemo(() => construirJerarquia(areasVisibles), [areasVisibles]);
  const resultadoBusqueda = useMemo(
    () => consultaBusqueda ? filtrarJerarquia(jerarquiaAreas, empleados, consultaBusqueda) : null,
    [jerarquiaAreas, empleados, consultaBusqueda]
  );

  // Áreas válidas para "Depende de": todas menos ella misma y sus sub-áreas (evita ciclos)
  const opcionesPadrePorArea = useMemo(() => {
    const mapa = new Map<number, Area[]>();
    areas.forEach(area => {
      const excluidas = idsDescendientes(area.id, areas);
      mapa.set(area.id, areas.filter(a => a.id !== area.id && !excluidas.has(a.id)));
    });
    return mapa;
  }, [areas]);

  const puedeVerTablero = esAdmin || esAuditor || tieneEquipo;
  const puedeBuscar = puedeVerTablero;
  function cambiarBusqueda(texto: string) {
    setBusqueda(texto);
    // La búsqueda se ve en el tablero: llevamos al usuario ahí
    if (texto && vista !== 'tablero') setVista('tablero');
  }


  // A quién evalúa "hacia arriba": su jefe directo o, si no tiene, el líder de su área
  const miAreaInfo = areas.find(a => a.id === miDesempeno?.area_id);
  const miLiderId = miDesempeno?.jefe_directo_id ?? (miAreaInfo?.lider_id !== miDesempeno?.id ? miAreaInfo?.lider_id : null);
  const entradaLider = directorio.find(e => e.id === miLiderId);
  const miLider: Empleado | undefined = entradaLider
    ? { ...entradaLider, email: '', cumplimiento_general: 0 }
    : undefined;
  const nombrePorId = new Map<number, string>([
    ...directorio.map(e => [e.id, e.nombre] as [number, string]),
    ...empleadosDesvinculados.map(e => [e.id, `${e.nombre} (desvinculado)`] as [number, string]),
  ]);
  // Reportes directos a los que puede hacer evaluación descendente
  const equipoDirecto = empleados.filter(e => directosIds.has(e.id));
  // Organigrama: con desempeño para Admin/Auditor; informativo (sin cumplimiento) para el resto
  const verDesempenoEnOrganigrama = esAdmin || esAuditor;
  const empleadosOrganigrama: Empleado[] = verDesempenoEnOrganigrama
    ? empleados
    : directorio.map(e => ({ ...e, email: '', cumplimiento_general: 0 }));

  if (loading) return <div className="p-10 text-center text-slate-500 font-medium w-full h-screen flex items-center justify-center bg-slate-50">Iniciando Plataforma Corporativa...</div>

  // Objeto de funciones tipado que se pasa a TarjetaEmpleado
  const funcionesTarjeta: FuncionesTarjeta = {
    asignarAreaEmpleado, actualizarIndicador, agregarIndicador, crearPlan, completarPlan,
    setExpandidoId, expandidoId, nuevosIndicadores, setNuevosIndicadores, textosPlanes, setTextosPlanes,
    diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevosComentarios, setNuevosComentarios,
    eliminarIndicador, actualizarDescripcionPuesto,
    guardarEvaluacionPotencial, guardarFeedbackKPI,verPerfilCompleto: (emp) => setEmpleadoViendoPerfil(emp),
    ...(esAdmin && {
      editarColaborador: (emp: Empleado) => { abrirEdicionColaborador(emp); },
      desvincularColaborador: (emp: Empleado) => setEmpleadoDesvinculando(emp),
    }),
  };

  // --- AQUI EMPIEZA EL NUEVO LAYOUT VISUAL ---
  return (
    <ProveedorUmbrales value={umbrales}>
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden font-sans">
      
      {/* ========================================== */}
      {/* 1. MENÚ LATERAL IZQUIERDO (SIDEBAR)        */}
      {/* ========================================== */}
      <aside className="w-[260px] bg-white border-r border-slate-200 flex flex-col z-20 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.1)] hidden md:flex shrink-0">
        
        {/* Logo de la Empresa */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-black text-[#FF4C4C] tracking-tighter flex items-center gap-2">
            <span className="bg-[#FF4C4C] text-white w-6 h-6 rounded flex items-center justify-center text-xs">t</span>
            {nombreEmpresa || "toteat HR"}
          </h2>
        </div>

        {/* Links de Navegación */}
        <div className="flex-1 overflow-y-auto py-5 px-4 space-y-6 custom-scrollbar">
          
          <div>
            <p className="px-3 text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Mi Espacio</p>
            <div className="space-y-1">
              <BotonLateral icono="🏠" texto="Inicio" activo={vista === 'tablero'} onClick={() => setVista('tablero')} visible={puedeVerTablero} />
              <BotonLateral icono="👤" texto="Mi Perfil" activo={vista === 'mi_perfil'} onClick={() => setVista('mi_perfil')} visible={true} />
              <BotonLateral icono="🗂️" texto="Organigrama" activo={vista === 'organigrama'} onClick={() => setVista('organigrama')} visible={true} />
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Talento</p>
            <div className="space-y-1">
              <BotonLateral icono="📋" texto="Desempeño (BI)" activo={vista === 'informes'} onClick={() => setVista('informes')} visible={puedeVerTablero} />
              <BotonLateral icono="⭐" texto="Evaluaciones 360" activo={vista === 'evaluaciones'} onClick={() => setVista('evaluaciones')} visible={true} />
            </div>
          </div>
          
        </div>
      </aside>

      {/* ========================================== */}
      {/* 2. ÁREA CENTRAL (HEADER + CONTENIDO)       */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* HEADER SUPERIOR */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-slate-200 z-10 shrink-0 shadow-sm">
          <h1 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="text-slate-500 font-medium">Página de inicio</span>
            {vista !== 'tablero' && <span className="text-slate-300">/</span>}
            {vista !== 'tablero' && <span className="text-[#FF4C4C] capitalize">{vista.replace('_', ' ')}</span>}
          </h1>
          
          <div className="flex items-center gap-4">
            {/* Buscador: filtra áreas y colaboradores */}
            {puedeBuscar && (
              <div className="hidden lg:flex items-center bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-sm focus-within:border-[#FF4C4C] focus-within:bg-white transition-colors">
                <span className="mr-2 text-slate-400">🔍</span>
                <input
                  type="search"
                  value={busqueda}
                  onChange={e => cambiarBusqueda(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setBusqueda(''); }}
                  placeholder="Buscar área o colaborador..."
                  aria-label="Buscar área o colaborador"
                  className="bg-transparent outline-none text-slate-700 placeholder:text-slate-400 w-56 [&::-webkit-search-cancel-button]:hidden"
                />
                {busqueda && (
                  <button type="button" onClick={() => setBusqueda('')} className="ml-1 text-slate-400 hover:text-slate-700 text-xs" aria-label="Limpiar búsqueda">✕</button>
                )}
              </div>
            )}
            {esAuditor && (
              <span className="text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full">
                👁️ Modo Auditoría (Solo Lectura)
              </span>
            )}

            {tieneEquipo && (
              <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full" title="Ves las áreas que lideras y sus sub-áreas; puedes editar solo a tus reportes directos">
                🧭 Vista de equipo ({directosIds.size} directo{directosIds.size === 1 ? '' : 's'} · {Math.max(dataParaMetricas.length - directosIds.size, 0)} en cascada)
              </span>
            )}

            {esAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setModalCorteAbierto(true)}
                  className="bg-slate-800 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-slate-900 transition flex items-center gap-1.5"
                  title="Generar snapshot formal de cumplimiento"
                >
                  <span>📅</span> Cerrar Periodo
                </button>

                <button
                  onClick={abrirModalInvitacion}
                  className="bg-[#FF4C4C] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-red-600 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <span>🔑</span> Dar Acceso
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={descargarPlantilla}
                    className="text-slate-500 hover:text-slate-800 text-xs font-bold transition flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200"
                  >
                    <span>⬇️</span> Plantilla
                  </button>

                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={subiendoExcel}
                    className="text-slate-500 hover:text-slate-800 text-xs font-bold transition flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200 disabled:opacity-50"
                  >
                    <span>⬆️</span> {subiendoExcel ? 'Cargando...' : 'Subir Excel'}
                  </button>
                </div>
              </>
            )}
            
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4 ml-2">
              <div className="hidden md:block text-right">
                <p className="text-xs font-bold text-slate-700 leading-tight">{perfil?.nombre}</p>
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-[10px] text-slate-400 hover:text-red-500 hover:underline leading-tight transition-colors">Cerrar Sesión</button>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shadow-sm border border-blue-200">
                {perfil?.nombre?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* CONTENIDO PRINCIPAL (El que hace Scroll) */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar relative">
          <div className="max-w-[1200px] mx-auto">
{/* --- CONTENIDO: TABLERO ADMIN --- */}
            {puedeVerTablero && vista === 'tablero' && (
              <div className="animate-in fade-in space-y-8">

                {esAdmin && (
                  <>
                    {/* Panel superior: Crear Área, Crear Puesto y Nuevo Colaborador */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Crear Área */}
                      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nueva Área</label>
                          <input
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-slate-900 outline-none focus:border-[#FF4C4C]"
                            placeholder="Ej: Ventas..."
                            value={nuevaAreaNombre}
                            onChange={e => setNuevaAreaNombre(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Reporta a</label>
                          <select
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-slate-700 outline-none focus:border-[#FF4C4C]"
                            value={nuevaAreaPadre}
                            onChange={e => setNuevaAreaPadre(e.target.value)}
                          >
                            <option value="">(Área Principal)</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={crearArea}
                          className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-900 transition h-[34px]"
                        >
                          + Área
                        </button>
                      </div>

                      {/* Crear Puesto de Trabajo */}
                      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            Nuevo Puesto ({puestos.length})
                          </label>
                          <input
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-slate-900 outline-none focus:border-[#FF4C4C]"
                            placeholder="Ej: Gerente Comercial..."
                            value={nuevoPuestoNombre}
                            onChange={e => setNuevoPuestoNombre(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            Puestos Disponibles
                          </label>
                          <select
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-slate-700 outline-none"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              {puestos.length > 0 ? `Ver (${puestos.length}) puestos...` : 'Sin puestos creados'}
                            </option>
                            {puestos.map(p => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={crearPuesto}
                          className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-900 transition h-[34px]"
                        >
                          + Puesto
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalNuevoEmpAbierto(true)}
                          className="bg-[#FF4C4C] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-600 transition h-[34px] shadow-sm"
                        >
                          + Nuevo Colaborador
                        </button>
                      </div>
                    </div>

                    {/* Bandeja de Pendientes de Estructura Organizacional */}
                    {(() => {
                      const sinArea = empleados.filter(e => !e.area_id && coincideEmpleado(e, consultaBusqueda));
                      const areasSinLider = areas.filter(a => !a.lider_id);
                      if (sinArea.length === 0 && areasSinLider.length === 0) return null;

                      return (
                        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">⚠️</span>
                              <div>
                                <h3 className="text-sm font-bold text-slate-800">Pendientes de Estructura Organizacional</h3>
                                <p className="text-[11px] text-slate-500">
                                  {sinArea.length} colaborador(es) sin área • {areasSinLider.length} área(s) sin líder asignado
                                </p>
                              </div>
                            </div>

                            {areasSinLider.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {areasSinLider.map(a => (
                                  <span key={a.id} className="text-[10px] font-bold bg-white text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">
                                    Sin líder: {a.nombre}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {sinArea.length > 0 && (
                            <div className="bg-white rounded-xl border border-amber-200/80 p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={seleccionadosSinArea.length === sinArea.length && sinArea.length > 0}
                                    onChange={() => setSeleccionadosSinArea(
                                      seleccionadosSinArea.length === sinArea.length ? [] : sinArea.map(e => e.id)
                                    )}
                                    className="accent-[#FF4C4C] rounded"
                                  />
                                  Seleccionar todos ({sinArea.length})
                                </label>

                                <div className="flex items-center gap-2">
                                  <select
                                    value={areaDestinoBloque}
                                    onChange={(e) => setAreaDestinoBloque(e.target.value)}
                                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 outline-none focus:border-[#FF4C4C]"
                                  >
                                    <option value="">-- Elegir Área destino --</option>
                                    {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={asignarAreaEnBloque}
                                    disabled={asignandoBloque || seleccionadosSinArea.length === 0 || !areaDestinoBloque}
                                    className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-900 transition disabled:opacity-40"
                                  >
                                    {asignandoBloque ? 'Asignando...' : `Asignar (${seleccionadosSinArea.length})`}
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                                {sinArea.map(emp => {
                                  const marcado = seleccionadosSinArea.includes(emp.id);
                                  return (
                                    <label
                                      key={emp.id}
                                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                                        marcado ? 'bg-red-50/60 border-[#FF4C4C]/40' : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={() => setSeleccionadosSinArea(prev =>
                                          prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                                        )}
                                        className="accent-[#FF4C4C]"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="font-bold text-slate-800 truncate">{emp.nombre}</p>
                                        <p className="text-[10px] text-slate-500 truncate">
                                          {emp.puesto} • <span className="font-semibold text-slate-700">{emp.tipo_perfil || 'Empleado'}</span>
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* Resumen de la búsqueda */}
                {resultadoBusqueda && (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-5 py-3 text-xs">
                    <span className="text-slate-600">
                      🔍 <strong className="text-slate-800">&quot;{busqueda.trim()}&quot;</strong>:{' '}
                      {resultadoBusqueda.totalAreas} área(s) y {resultadoBusqueda.totalEmpleados} colaborador(es) encontrados
                    </span>
                    <button type="button" onClick={() => setBusqueda('')} className="font-bold text-[#FF4C4C] hover:underline">
                      Limpiar búsqueda
                    </button>
                  </div>
                )}

                {/* Áreas en orden jerárquico, con Health Cards */}
                {resultadoBusqueda && resultadoBusqueda.nodos.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 italic py-10">No hay áreas ni colaboradores que coincidan con la búsqueda.</p>
                ) : (
                  <ArbolAreas
                    nodos={resultadoBusqueda ? resultadoBusqueda.nodos : jerarquiaAreas}
                    forzarAbiertas={!!resultadoBusqueda}
                    renderArea={({ area, ruta }) => {
                      const miembrosArea = empleados.filter(e => e.area_id === area.id);
                      // Con búsqueda: si coincide el nombre del área se ven todos; si no, solo los colaboradores que coinciden
                      const coincideArea = resultadoBusqueda?.areasCoincidentes.has(area.id);
                      const empCoinciden = resultadoBusqueda?.empleadosCoincidentesPorArea.get(area.id) || [];
                      const empleadosVisibles = resultadoBusqueda && !coincideArea ? empCoinciden : undefined;
                      return (
                        <TarjetaSaludArea
                          area={area}
                          ruta={ruta}
                          empleadosArea={miembrosArea}
                          empleadosVisibles={empleadosVisibles}
                          atenuada={!!resultadoBusqueda && !coincideArea && empCoinciden.length === 0}
                          todosLosEmpleados={empleados}
                          todasLasAreas={areas}
                          opcionesPadre={opcionesPadrePorArea.get(area.id)}
                          estaAbierta={!!areasAbiertas[area.id] || (!!resultadoBusqueda && !coincideArea && empCoinciden.length > 0)}
                          onToggle={() => toggleArea(area.id)}
                          funcionesTarjeta={funcionesTarjeta}
                          asignarLiderArea={asignarLiderArea}
                          asignarPadreArea={asignarPadreArea}
                          calcularGantt={calcularGantt}
                          puedeEditarEstructura={esAdmin}
                          puedeEditarEmpleado={puedeEditarColaborador}
                          renombrarArea={esAdmin ? renombrarArea : undefined}
                          eliminarArea={esAdmin ? eliminarArea : undefined}
                        />
                      );
                    }}
                  />
                )}

                {/* Personas de su equipo que le reportan desde áreas que no lidera (jefe directo) */}
                {reportesFueraDeArea.filter(e => coincideEmpleado(e, consultaBusqueda)).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 md:p-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-1">👤 Reportes de otras áreas</h3>
                    <p className="text-[11px] text-slate-500 mb-4">Te tienen como jefe directo aunque pertenecen a un área que no lideras.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {reportesFueraDeArea.filter(e => coincideEmpleado(e, consultaBusqueda)).map(emp => (
                        <TarjetaEmpleado key={emp.id} emp={emp} esLider={false} areas={areas} allowEdit={puedeEditarColaborador(emp)} funciones={funcionesTarjeta} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Ex-colaboradores: se conservan para el histórico */}
                {esAdmin && (
                  <SeccionDesvinculados
                    desvinculados={empleadosDesvinculados.filter(e => coincideEmpleado(e, consultaBusqueda))}
                    areas={areas}
                    onVerHistorial={(emp) => setEmpleadoViendoPerfil(emp)}
                    onReactivar={reactivarColaborador}
                  />
                )}

                {/* Panel lateral: alta y edición de colaboradores (ficha completa) */}
                {esAdmin && (modalNuevoEmpAbierto || empleadoEditando) && (
                  <PanelColaborador
                    key={empleadoEditando ? `editar-${empleadoEditando.id}` : 'crear'}
                    modo={empleadoEditando ? 'editar' : 'crear'}
                    emp={empleadoEditando ?? undefined}
                    puestos={puestos}
                    areas={areas}
                    activos={empleados}
                    desvinculados={empleadosDesvinculados}
                    roles={ROLES_DISPONIBLES}
                    monedaPorDefecto={monedaPreferida}
                    compensaciones={empleadoEditando ? compensacionesEditando : undefined}
                    onCrearPuesto={crearPuestoRapido}
                    onGuardar={(datos, comp, opciones) =>
                      empleadoEditando ? guardarEdicionColaborador(empleadoEditando, datos, comp) : crearColaborador(datos, comp, opciones)}
                    onDesvincular={(emp) => setEmpleadoDesvinculando(emp)}
                    onClose={() => { setEmpleadoEditando(null); setModalNuevoEmpAbierto(false); }}
                  />
                )}
                {esAdmin && empleadoDesvinculando && (
                  <ModalDesvincularColaborador
                    key={empleadoDesvinculando.id}
                    emp={empleadoDesvinculando}
                    esLiderDe={areas.filter(a => a.lider_id === empleadoDesvinculando.id).map(a => a.nombre)}
                    onClose={() => setEmpleadoDesvinculando(null)}
                    onConfirm={desvincularColaborador}
                  />
                )}
                {/* Credenciales del colaborador recién creado con "Dar acceso ahora" */}
                {esAdmin && accesoRecienCreado && (
                  <ModalAccesos
                    candidatos={[]}
                    resultadoInicial={accesoRecienCreado}
                    onOtorgar={otorgarAccesos}
                    onClose={() => setAccesoRecienCreado(null)}
                  />
                )}
              </div>
            )}

            {/* --- CONTENIDO: ORGANIGRAMA --- */}
            {vista === 'organigrama' && (
              <div className="bg-slate-100 p-8 rounded-2xl overflow-x-auto overflow-y-auto h-[750px] flex justify-center items-start animate-in zoom-in-95 border border-slate-200 shadow-inner custom-scrollbar relative">
                <div className="absolute top-4 left-4 text-slate-300 font-bold text-2xl tracking-widest opacity-50 select-none">ESTRUCTURA ORGANIZACIONAL</div>
                <div className="flex gap-16 pb-32 pt-10">
                  {construirArbol(areas, empleadosOrganigrama).map(areaRaiz => (<NodoOrganigrama key={areaRaiz.id} area={areaRaiz} mostrarCumplimiento={verDesempenoEnOrganigrama} />))}
                </div>
              </div>
            )}

            {/* --- CONTENIDO: EVALUACIONES 360 --- */}
            {vista === 'evaluaciones' && ((esAdmin || esAuditor) ? (
              <ReporteEvaluaciones titulo="📋 Reporte Global de Evaluaciones 360" evaluaciones={evaluaciones} nombrePorId={nombrePorId} />
            ) : (
              <div className="space-y-8">
                <VistaEvaluaciones360 miDesempeno={miDesempeno} esLider={esLider} equipo={equipoDirecto} miLider={miLider} evaluaciones={evaluaciones} onSave={guardarEvaluacion} />
                {tieneEquipo && (
                  <ReporteEvaluaciones
                    titulo="📋 Evaluaciones recibidas por mi equipo"
                    evaluaciones={evaluaciones.filter(ev => ev.evaluado_id !== miDesempeno?.id && dataParaMetricas.some(e => e.id === ev.evaluado_id))}
                    nombrePorId={nombrePorId}
                    anonimizarAscendentes
                    vacio="Tu equipo aún no ha recibido evaluaciones."
                  />
                )}
              </div>
            ))}

            {/* --- CONTENIDO: INFORMES (BI) --- */}
            {vista === 'informes' && puedeVerTablero && (
              <PanelBI
                empleados={dataParaMetricas}
                areasAlcance={areasVisibles}
                areas={areas}
                etiquetaAlcance={esAdmin || esAuditor ? '🏢 Toda la organización' : `🧭 Tu equipo (${dataParaMetricas.length})`}
                onVerFicha={(emp) => setEmpleadoViendoPerfil(emp)}
                onConfiguracionGuardada={(c) => setUmbrales({ umbral_desempeno_bajo: c.umbral_desempeno_bajo, umbral_desempeno_alto: c.umbral_desempeno_alto })}
              />
            )}

           {/* --- CONTENIDO: MI PERFIL (CURVA DE CUMPLIMIENTO HISTÓRICO) --- */}
            {vista === 'mi_perfil' && miDesempeno && (() => {
              const historicoOrdenado = [...(miDesempeno.historico || [])].sort(
                (a, b) => new Date(a.fecha_corte).getTime() - new Date(b.fecha_corte).getTime()
              );
              const ultimoCorte = historicoOrdenado[historicoOrdenado.length - 1];
              const corteAnterior = historicoOrdenado[historicoOrdenado.length - 2];
              const variacion = ultimoCorte && corteAnterior 
                ? Number((ultimoCorte.cumplimiento - corteAnterior.cumplimiento).toFixed(1)) 
                : null;

              return (
                <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in-95 mt-2">
                  
                  {/* 1. Cabecera del Colaborador y Score */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF4C4C] bg-red-50 px-3 py-1 rounded-full border border-red-100">
                        Perfil & Performance
                      </span>
                      <h2 className="text-2xl md:text-3xl font-black text-slate-800 mt-2">{miDesempeno.nombre}</h2>
                      <p className="text-slate-500 font-medium text-xs md:text-sm">{miDesempeno.puesto}</p>
                      {miDesempeno.job_descripcion && (
                        <p className="text-xs text-slate-400 mt-2 max-w-xl italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          {miDesempeno.job_descripcion}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {variacion !== null && (
                        <div className={`px-3.5 py-2 rounded-2xl border text-center ${
                          variacion >= 0 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                          <span className="text-[9px] font-black uppercase block">Tendencia</span>
                          <span className="text-sm font-black">
                            {variacion >= 0 ? `▲ +${variacion}%` : `▼ ${variacion}%`}
                          </span>
                        </div>
                      )}

                      <div className="bg-[#FFF5F5] p-5 rounded-2xl border border-[#FFEAEA] text-right min-w-[155px]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Cumplimiento Actual</span>
                        <h3 className="text-5xl font-black text-[#FF4C4C]">{miDesempeno.cumplimiento_general}%</h3>
                        <span className="text-[10px] font-bold text-slate-500 mt-1 block">
                          Potencial: {miDesempeno.potencial_score === 3 ? '⭐ Alto' : miDesempeno.potencial_score === 2 ? '🚀 Medio' : '🌱 Bajo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Gráfica de Curva de Cumplimiento a través del tiempo */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                      <div>
                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                          📈 Curva de Cumplimiento a través del Tiempo
                        </h3>
                        <p className="text-xs text-slate-400">
                          Histórico consolidado por periodo ({historicoOrdenado.length} {historicoOrdenado.length === 1 ? 'registro' : 'registros'})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-semibold">
                          Meta Esperada: <strong>85%</strong>
                        </span>
                      </div>
                    </div>

                    {historicoOrdenado.length > 0 ? (
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={historicoOrdenado}
                            margin={{ top: 15, right: 15, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="curvaCumplimiento" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FF4C4C" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#FF4C4C" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="periodo" 
                              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                              axisLine={false} 
                              tickLine={false} 
                            />
                            <YAxis 
                              domain={[0, 100]} 
                              tick={{ fontSize: 11, fill: '#94a3b8' }} 
                              axisLine={false} 
                              tickLine={false} 
                            />
                            <Tooltip 
                              formatter={(value: any) => [`${value}%`, 'Cumplimiento']}
                              contentStyle={{ 
                                backgroundColor: '#0f172a', 
                                borderRadius: '12px', 
                                border: 'none', 
                                color: '#fff', 
                                fontSize: '12px' 
                              }}
                            />
                            <ReferenceLine 
                              y={85} 
                              stroke="#10b981" 
                              strokeDasharray="4 4" 
                              label={{ value: 'Meta 85%', position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} 
                            />
                            <RechartsArea 
                              type="monotone" 
                              dataKey="cumplimiento" 
                              stroke="#FF4C4C" 
                              strokeWidth={3} 
                              fillOpacity={1} 
                              fill="url(#curvaCumplimiento)" 
                              dot={{ fill: '#FF4C4C', stroke: '#fff', strokeWidth: 2, r: 5 }}
                              activeDot={{ r: 7 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                        <p className="text-xs text-slate-500">
                          Aún no hay puntos históricos guardados. Califica un indicador o pulsa <strong>"Cerrar Periodo"</strong> para iniciar la curva.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 3. Indicadores Activos del Colaborador */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 mb-4">🎯 Mis Indicadores (KPIs)</h3>
                    <div className="space-y-4">
                      {miDesempeno.indicadores && miDesempeno.indicadores.length > 0 ? (
                        miDesempeno.indicadores.map(ind => (
                          <div key={ind.id} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{ind.titulo}</span>
                                <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase font-bold">
                                  {ind.periodo || 'trimestral'}
                                </span>
                              </div>
                              <span className="font-black text-slate-800">{ind.progreso}%</span>
                            </div>
                            {ind.descripcion && (
                              <p className="text-[11px] text-slate-400 mb-2">{ind.descripcion}</p>
                            )}
                            <div className="flex items-center gap-4 text-[11px] text-slate-500 mb-2">
                              <span>Meta: <strong>{ind.meta_esperada || 0} {ind.unidad_medida}</strong></span>
                              <span>Actual: <strong>{ind.resultado_actual || 0} {ind.unidad_medida}</strong></span>
                            </div>
                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-[#FF4C4C] to-red-600 rounded-full transition-all duration-500" 
                                style={{ width: `${ind.progreso}%` }}
                              />
                            </div>
                            {ind.feedback_lider && (
                              <div className="mt-3 text-[11px] text-slate-600 bg-white p-3 rounded-lg border border-slate-200/70">
                                <strong className="text-slate-800 font-semibold block mb-0.5">Feedback del líder:</strong>
                                <p className="italic">{ind.feedback_lider}</p>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No tienes indicadores asignados actualmente.</p>
                      )}
                    </div>
                  </div>


                  {/* Historial laboral propio (sin ajustes salariales, que solo ve el Admin) */}
                  <HistorialEmpleado empleadoId={miDesempeno.id} fechaIngreso={miDesempeno.fecha_ingreso} />
                </div>
              );
            })()}

            {/* MODAL DE BLOQUEO OFICIAL DE PERIODO */}
            {modalCorteAbierto && (() => {
              const etiquetaSeleccionada = `${mesCorte} ${anioCorte}`;
              const seleccionYaBloqueada = periodosBloqueados.some(
                p => p.periodo.toLowerCase() === etiquetaSeleccionada.toLowerCase()
              );

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-red-50 text-[#FF4C4C] rounded-xl text-base">🔒</span>
                        <h3 className="text-base font-bold text-slate-800">Bloquear Periodo Oficial</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalCorteAbierto(false)}
                        className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 text-xs flex items-center justify-center transition"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      Selecciona el mes, año y fecha efectiva para congelar el score de los <strong>{empleados.length} colaboradores</strong>.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          Mes
                        </label>
                        <select
                          value={mesCorte}
                          onChange={(e) => setMesCorte(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C] font-semibold text-slate-800 cursor-pointer"
                        >
                          {MESES_ANIO.map((mes) => {
                            const bloqueado = periodosBloqueados.some(
                              p => p.periodo.toLowerCase() === `${mes} ${anioCorte}`.toLowerCase()
                            );
                            return (
                              <option key={mes} value={mes} disabled={bloqueado}>
                                {mes} {bloqueado ? '(🔒 Bloqueado)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          Año
                        </label>
                        <select
                          value={anioCorte}
                          onChange={(e) => {
                            const nuevoAnio = Number(e.target.value);
                            setAnioCorte(nuevoAnio);
                            const primerDisponible = MESES_ANIO.find(
                              m => !periodosBloqueados.some(p => p.periodo.toLowerCase() === `${m} ${nuevoAnio}`.toLowerCase())
                            );
                            if (primerDisponible) setMesCorte(primerDisponible);
                          }}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C] font-semibold text-slate-800 cursor-pointer"
                        >
                          {ANIOS_DISPONIBLES.map((anio) => (
                            <option key={anio} value={anio}>
                              {anio}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          Fecha de Bloqueo
                        </label>
                        <input
                          type="date"
                          value={fechaCortePeriodo}
                          onChange={(e) => setFechaCortePeriodo(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C] font-semibold text-slate-800 cursor-pointer"
                        />
                      </div>
                    </div>

                    {seleccionYaBloqueada && (
                      <div className="mb-4 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                        ⚠️ El periodo <strong>{etiquetaSeleccionada}</strong> ya fue bloqueado. Elige otro mes disponible.
                      </div>
                    )}

                    {/* Lista de Periodos Bloqueados */}
                    <div className="mb-5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                        Periodos Bloqueados ({periodosBloqueados.length})
                      </span>
                      {periodosBloqueados.length > 0 ? (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                          {periodosBloqueados.map((p) => (
                            <div
                              key={p.periodo}
                              className="flex items-center justify-between bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-xl text-xs"
                            >
                              <div>
                                <span className="font-bold text-slate-800 block">{p.periodo}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} • {p.total} colab.
                                </span>
                              </div>
                              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                🔒 Bloqueado
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 text-center">
                          Aún no hay periodos bloqueados.
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setModalCorteAbierto(false)}
                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition"
                      >
                        Cerrar
                      </button>
                      <button
                        type="button"
                        onClick={ejecutarCorteOficial}
                        disabled={ejecutandoCorte || seleccionYaBloqueada}
                        className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ejecutandoCorte ? 'Bloqueando...' : `🔒 Bloquear ${etiquetaSeleccionada}`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MODAL DE INVITACIONES INTELIGENTES */}
            {modalInvitarAbierto && (
              <ModalAccesos
                candidatos={empleados.filter(e => e.email !== perfil?.email)}
                onClose={() => { setModalInvitarAbierto(false); recargarDatos(); }}
                onOtorgar={otorgarAccesos}
              />
            )}
            {empleadoViendoPerfil && (
              <ModalPerfilColaborador 
                emp={empleadoViendoPerfil} 
                onClose={() => setEmpleadoViendoPerfil(null)} 
              />  
             )}

          </div>
        </main>
      </div>
    </div>
    </ProveedorUmbrales>
  );
}
