'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area as RechartsArea, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { estaActivo, type TipoPerfil, type Puesto, type Area, type Evaluacion, type Empleado, type Perfil, type FuncionesTarjeta, type Compensacion, type NivelCargo, type RangoSalarialCargo } from '@/lib/tipos'
import { CatalogoCargos, type DatosRango } from '@/components/CatalogoCargos'
import { payloadCargo, validarCargo, traducirErrorDuplicado, type DatosCargo } from '@/lib/cargos'
import { limpiarNombre, normalizarNombre } from '@/lib/similitud'
import { PanelColaborador, type OpcionesGuardado } from '@/components/PanelColaborador'
import { payloadEmpleado, parsearMonto, emailNormalizado, type DatosColaborador, type DatosCompensacion } from '@/lib/colaboradores'
import { ModalDesvincularColaborador } from '@/components/ModalDesvincularColaborador'
import { SeccionDesvinculados } from '@/components/SeccionDesvinculados'
import { ArbolAreas } from '@/components/ArbolAreas'
import { ModalAccesos } from '@/components/ModalAccesos'
import { cargarDatosSesion, type RespuestaDatos, type EntradaDirectorio, type InfoPeriodos } from '@/lib/datos'
import type { Alcance } from '@/lib/alcance'
import { ReporteEvaluaciones } from '@/components/ReporteEvaluaciones'
import { HistorialEmpleado } from '@/components/HistorialEmpleado'
import { otorgarAccesos, sincronizarRol, type ResultadoOtorgar, revocarAcceso, restaurarAcceso, debeCambiarClave } from '@/lib/accesos'
import { construirJerarquia, filtrarJerarquia, idsDescendientes, coincideEmpleado, normalizarTexto } from '@/lib/jerarquia'
import { BotonLateral } from '@/components/BotonLateral'
import { Logo } from '@/components/marca/Logo'
import { AnilloProgreso, BandaProgreso, Logros } from '@/components/marca/Crecimiento'
import { etiquetaPotencial, logrosDe, mensajeProgreso } from '@/lib/motivacion'
import { Vista360 } from '@/components/evaluacion360/Vista360'
import { construirArbol, NodoOrganigrama } from '@/components/Organigrama'
import { TarjetaSaludArea } from '@/components/TarjetaSaludArea'
import { TarjetaEmpleado } from '@/components/TarjetaEmpleado'
import { PanelBI } from '@/components/bi/PanelBI'
import { AsistenteImportacion } from '@/components/importacion/AsistenteImportacion'
import { AsistenteCierre } from '@/components/periodos/AsistenteCierre'
import { VistaOKR } from '@/components/okr/VistaOKR'
import { MiEquipo } from '@/components/inicio/MiEquipo'
import { BuscadorGlobal } from '@/components/BuscadorGlobal'
import { ancestrosDe } from '@/lib/busqueda'
import { cargarOKR } from '@/lib/okrApi'
import type { ObjetivoOKR, ResultadoClave } from '@/lib/okr'
import { AvisosPeriodo, ChipPeriodo } from '@/components/periodos/AvisosPeriodo'
import { calificarKpi as calificarKpiApi, guardarPesosKpi } from '@/lib/periodosApi'
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
  const [busqueda, setBusqueda] = useState('') // texto del buscador del encabezado (muestra resultados desplegables)
  const [filtroArbol, setFiltroArbol] = useState('') // búsqueda aplicada como filtro del árbol "Por áreas" (solo si se pide)
  const [seleccionPersona, setSeleccionPersona] = useState<{ id: number; marca: number } | null>(null)
  const [areaResaltada, setAreaResaltada] = useState<number | null>(null)
  const [areaRevelada, setAreaRevelada] = useState<number | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  // Estados para el Modal de Invitaciones Inteligentes
  const [modalInvitarAbierto, setModalInvitarAbierto] = useState(false);
  // Estados para el Modal de Corte Oficial
  const [modalCorteAbierto, setModalCorteAbierto] = useState(false);
  const [empleadoViendoPerfil, setEmpleadoViendoPerfil] = useState<Empleado | null>(null);
  // Períodos (mes 'AAAA-MM'): meses cerrados y días para calificar tras el fin de mes
  // OKR del año en curso (para vincular KPIs a resultados clave de su área)
  const [okrAnio, setOkrAnio] = useState<{ objetivos: ObjetivoOKR[]; krs: ResultadoClave[] } | null>(null);
  const [infoPeriodos, setInfoPeriodos] = useState<InfoPeriodos>({ cerrados: [], diasLimite: 5, disponible: false });

  

  // Alcance de visibilidad (lib/alcance.ts) y directorio mínimo para el organigrama informativo
  const [alcance, setAlcance] = useState<Alcance | null>(null)
  const [directorio, setDirectorio] = useState<EntradaDirectorio[]>([])
  // Umbrales de desempeño de la empresa (configurables en el BI); los usan todas las pantallas
  const [umbrales, setUmbrales] = useState<UmbralesDesempeno>(CONFIG_BI_DEFECTO)
  const [vista, setVista] = useState<'tablero' | 'organigrama' | 'informes' | 'mi_perfil' | 'evaluaciones' | 'okr' | 'estructura'>('tablero')
  // Inicio: 'equipo' = jerarquía por personas (zoom por niveles); 'areas' = árbol por áreas
  const [pestanaInicio, setPestanaInicio] = useState<'equipo' | 'areas'>('equipo')

  const [nuevaAreaNombre, setNuevaAreaNombre] = useState(''); const [nuevaAreaPadre, setNuevaAreaPadre] = useState<string>("");
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [nuevosIndicadores, setNuevosIndicadores] = useState<{ [key: number]: string }>({});
  const [textosPlanes, setTextosPlanes] = useState<{ [key: number]: string }>({}); const [diasPlanes, setDiasPlanes] = useState<{ [key: number]: number }>({});
  const [planChatAbierto, setPlanChatAbierto] = useState<number | null>(null);
  const [nuevosComentarios, setNuevosComentarios] = useState<{ [key: number]: string }>({});
  const [nombreEmpresa, setNombreEmpresa] = useState('');

  const ROLES_DISPONIBLES: TipoPerfil[] = ['Admin', 'Manager', 'Líder de Área', 'Empleado', 'Auditor'];

  // Catálogo de cargos (tabla "puestos") y niveles
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [niveles, setNiveles] = useState<NivelCargo[]>([]);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [rangosCargo, setRangosCargo] = useState<Map<number, RangoSalarialCargo> | null>(null);

  // Modal de Creación Individual de Colaborador
  const [modalNuevoEmpAbierto, setModalNuevoEmpAbierto] = useState(false);

  // Bandeja de Asignación en Bloque (Sin Área)
  const [seleccionadosSinArea, setSeleccionadosSinArea] = useState<number[]>([]);
  const [areaDestinoBloque, setAreaDestinoBloque] = useState<string>('');
  const [asignandoBloque, setAsignandoBloque] = useState(false);
  const router = useRouter();
  const [importacionAbierta, setImportacionAbierta] = useState(false);

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
    setNiveles(datos.niveles || [])
    setEvaluaciones(datos.evaluaciones)
    setDirectorio(datos.directorio)
    setAlcance(datos.alcance)
    if (datos.monedaPreferida) setMonedaPreferida(datos.monedaPreferida)
    if (datos.umbrales) setUmbrales(datos.umbrales)
    if (datos.periodos) setInfoPeriodos(datos.periodos)
    // OKR del año para el vínculo de KPIs (si falla, p. ej. sin migración, los KPIs siguen funcionando)
    const ahora = new Date();
    cargarOKR(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) + 1)
      .then(r => setOkrAnio({ objetivos: r.objetivos, krs: r.krs }))
      .catch(() => setOkrAnio(null))

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



  async function crearArea() {
    const nombreLimpio = limpiarNombre(nuevaAreaNombre);
    if (!nombreLimpio) return;
    // Mismo nombre sin importar mayúsculas, tildes ni espacios (igual que el índice único de la BD)
    const existente = areas.find(a => normalizarNombre(a.nombre) === normalizarNombre(nombreLimpio));
    if (existente) { alert(`El área "${existente.nombre}" ya existe en tu organización.`); return; }
    const { error } = await supabase.from('areas').insert([{ nombre: nombreLimpio, parent_id: nuevaAreaPadre ? parseInt(nuevaAreaPadre) : null, empresa_id: perfil?.empresa_id }]);
    if (error) { alert(traducirErrorDuplicado(error.message) || "Hubo un error al crear el área. Intenta de nuevo."); console.error(error); }
    else { alert(`¡Área "${nombreLimpio}" creada con éxito!`); setNuevaAreaNombre(''); recargarDatos(); }
  }
  // Crea un cargo desde el panel del colaborador (en el área elegida) y lo deja disponible de inmediato
  async function crearPuestoRapido(nombrePuesto: string, areaId: number): Promise<Puesto | null> {
    const datos: DatosCargo = { nombre: nombrePuesto, area_id: String(areaId), nivel_id: '', descripcion: '' };
    const existente = puestos.find(p => p.area_id === areaId && normalizarNombre(p.nombre) === normalizarNombre(nombrePuesto));
    if (existente) return existente;
    const error = validarCargo(datos, puestos);
    if (error) { alert(error); return null; }
    const { data, error: e } = await supabase.from('puestos')
      .insert([{ ...payloadCargo(datos), empresa_id: perfil?.empresa_id }]).select().single();
    if (e || !data) { alert('Error al crear el cargo: ' + (traducirErrorDuplicado(e?.message || '') || e?.message || 'desconocido')); return null; }
    setPuestos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    return data;
  }

  // ---------- Catálogo de cargos y niveles (solo Admin) ----------
  async function abrirCatalogoCargos() {
    setCatalogoAbierto(true);
    setRangosCargo(null);
    const { data } = await supabase.from('rangos_salariales_cargo').select('*').eq('empresa_id', perfil?.empresa_id);
    setRangosCargo(new Map(((data || []) as RangoSalarialCargo[]).map(r => [r.puesto_id, r])));
  }

  async function guardarCargo(id: number | null, datos: DatosCargo, rango: DatosRango): Promise<boolean> {
    const error = validarCargo(datos, puestos, id ?? undefined);
    if (error) { alert(error); return false; }
    const min = rango.min.trim() ? parsearMonto(rango.min) : null;
    const max = rango.max.trim() ? parsearMonto(rango.max) : null;
    if ((rango.min.trim() && (min === null || min <= 0)) || (rango.max.trim() && (max === null || max <= 0))) { alert('El rango salarial no es válido.'); return false; }
    if (min !== null && max !== null && min > max) { alert('El salario mínimo es mayor que el máximo.'); return false; }

    const payload = payloadCargo(datos);
    const anterior = id ? puestos.find(p => p.id === id) : undefined;
    let puestoId = id;
    if (id) {
      const { error: e } = await supabase.from('puestos').update(payload).eq('id', id);
      if (e) { alert('No se pudo guardar el cargo: ' + (traducirErrorDuplicado(e.message) || e.message)); return false; }
      // Renombrado: el nombre del cargo también vive en cada colaborador
      if (anterior && anterior.nombre !== payload.nombre) {
        const { error: e2 } = await supabase.from('empleados').update({ puesto: payload.nombre }).eq('puesto_id', id);
        if (e2) alert('El cargo se renombró, pero no se pudo actualizar en los colaboradores: ' + e2.message);
      }
    } else {
      const { data, error: e } = await supabase.from('puestos').insert([{ ...payload, empresa_id: perfil?.empresa_id }]).select('id').single();
      if (e || !data) { alert('No se pudo crear el cargo: ' + (traducirErrorDuplicado(e?.message || '') || e?.message)); return false; }
      puestoId = data.id;
    }
    // Rango salarial (tabla protegida: solo Admin)
    if (puestoId) {
      const { error: e } = min === null && max === null
        ? await supabase.from('rangos_salariales_cargo').delete().eq('puesto_id', puestoId)
        : await supabase.from('rangos_salariales_cargo').upsert({ puesto_id: puestoId, empresa_id: perfil?.empresa_id, salario_min: min, salario_max: max, moneda: rango.moneda, updated_at: new Date().toISOString() });
      if (e) alert('El cargo se guardó, pero no el rango salarial: ' + e.message);
      else setRangosCargo(prev => {
        const m = new Map(prev || []);
        if (min === null && max === null) m.delete(puestoId!); else m.set(puestoId!, { puesto_id: puestoId!, salario_min: min, salario_max: max, moneda: rango.moneda });
        return m;
      });
    }
    await recargarDatos();
    return true;
  }

  async function eliminarCargo(p: Puesto): Promise<boolean> {
    const enUso = [...empleados, ...empleadosDesvinculados].filter(e => e.puesto_id === p.id);
    if (enUso.length > 0) { alert(`"${p.nombre}" lo tienen ${enUso.length} colaborador(es) (incluidos desvinculados). Muévelos a otro cargo antes de eliminarlo.`); return false; }
    const { error } = await supabase.from('puestos').delete().eq('id', p.id);
    if (error) { alert('No se pudo eliminar el cargo: ' + error.message); return false; }
    await recargarDatos();
    return true;
  }

  async function guardarNivel(id: number | null, nombre: string): Promise<boolean> {
    const { error } = id
      ? await supabase.from('niveles_cargo').update({ nombre }).eq('id', id)
      : await supabase.from('niveles_cargo').insert([{ nombre, empresa_id: perfil?.empresa_id, orden: Math.max(0, ...niveles.map(n => n.orden)) + 1 }]);
    if (error) {
      alert(/niveles_cargo/.test(error.message) && !/unico/.test(error.message)
        ? 'Falta aplicar la migración 20261119_cargos_estructura.sql en Supabase.'
        : 'No se pudo guardar el nivel: ' + (traducirErrorDuplicado(error.message) || error.message));
      return false;
    }
    await recargarDatos();
    return true;
  }

  async function eliminarNivel(n: NivelCargo): Promise<boolean> {
    const { error } = await supabase.from('niveles_cargo').delete().eq('id', n.id);
    if (error) { alert('No se pudo eliminar el nivel: ' + error.message); return false; }
    await recargarDatos();
    return true;
  }

  async function ordenarNiveles(ordenados: NivelCargo[]) {
    setNiveles(ordenados.map((n, i) => ({ ...n, orden: i + 1 })));
    const resultados = await Promise.all(ordenados.map((n, i) => supabase.from('niveles_cargo').update({ orden: i + 1 }).eq('id', n.id)));
    const fallo = resultados.find(r => r.error);
    if (fallo?.error) alert('No se pudo guardar el orden: ' + fallo.error.message);
    recargarDatos();
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
  // Un líder pertenece al área que lidera y lidera solo una (la BD lo garantiza: migración 20261122).
  // Si viene de otra área o lideraba otra, se confirma antes porque cambia su ubicación.
  async function asignarLiderArea(aid: number, lid: string) {
    const nuevoId = lid === '' ? null : parseInt(lid);
    const area = areas.find(a => a.id === aid);
    if (nuevoId !== null && area) {
      const persona = empleados.find(e => e.id === nuevoId);
      const lideraOtra = areas.find(a => a.lider_id === nuevoId && a.id !== aid);
      const areaActual = areas.find(a => a.id === persona?.area_id);
      const avisos = [
        persona && persona.area_id !== aid && `• ${persona.nombre} pertenece a "${areaActual?.nombre ?? 'sin área'}" y pasará a "${area.nombre}".`,
        lideraOtra && `• Dejará de liderar "${lideraOtra.nombre}", que quedará sin líder.`,
        area.lider_id && area.lider_id !== nuevoId && `• ${empleados.find(e => e.id === area.lider_id)?.nombre ?? 'El líder actual'} deja de ser líder de "${area.nombre}" (sigue en el área).`,
      ].filter(Boolean);
      if (avisos.length > 0 && !window.confirm(`¿Asignar a ${persona?.nombre ?? 'esta persona'} como líder de "${area.nombre}"?\n\n${avisos.join('\n')}`)) {
        recargarDatos(); // devuelve el selector a su valor
        return;
      }
    }
    const { error } = await supabase.from('areas').update({ lider_id: nuevoId }).eq('id', aid);
    if (error) alert(/areas_lider_unico_idx/.test(error.message) ? 'Esa persona ya lidera otra área.' : 'No se pudo asignar el líder: ' + error.message);
    recargarDatos();
  }
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
    if (cambiaTipoPerfil && emailNormalizado(emp.email) === emailNormalizado(perfil?.email)) {
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
    if (emailNormalizado(emp.email) === emailNormalizado(perfil?.email)) {
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
    if (areas.some(a => a.id !== aid && normalizarNombre(a.nombre) === normalizarNombre(nombreLimpio))) {
      alert(`Ya existe un área llamada "${nombreLimpio}".`);
      return false;
    }
    const { error } = await supabase.from('areas').update({ nombre: limpiarNombre(nombreLimpio) }).eq('id', aid);
    if (error) { alert('No se pudo renombrar el área: ' + (traducirErrorDuplicado(error.message) || error.message)); return false; }
    recargarDatos();
    return true;
  }

  async function eliminarArea(area: Area) {
    const activos = empleados.filter(e => e.area_id === area.id);
    const subAreas = areas.filter(a => a.parent_id === area.id);
    const cargosDelArea = puestos.filter(p => p.area_id === area.id);
    if (activos.length > 0 || subAreas.length > 0 || cargosDelArea.length > 0) {
      alert(
        `⛔ No se puede eliminar "${area.nombre}" todavía:\n\n` +
        (activos.length > 0 ? `• Tiene ${activos.length} colaborador(es) activo(s). Muévelos a otra área.\n` : '') +
        (subAreas.length > 0 ? `• Tiene sub-áreas que dependen de ella: ${subAreas.map(a => a.nombre).join(', ')}. Cámbiales el "Depende de".\n` : '') +
        (cargosDelArea.length > 0 ? `• Tiene ${cargosDelArea.length} cargo(s): ${cargosDelArea.slice(0, 5).map(p => p.nombre).join(', ')}. Muévelos a otra área o elimínalos en el catálogo de cargos.\n` : '')
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
    kr_id: datosKpi.kr_id ?? null,
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

  // Califica (o borra) el resultado de un KPI en un mes. El servidor valida permisos, fecha límite y cierre,
  // calcula el progreso y actualiza el cumplimiento del colaborador.
  async function calificarKpi(indicadorId: number, _eid: number, periodo: string, valor: number | null): Promise<boolean> {
    try {
      await calificarKpiApi(indicadorId, periodo, valor);
      await cargarDatos();
      return true;
    } catch (e) {
      alert(mensajeDeError(e));
      return false;
    }
  }

  // Pesos de los KPIs de una persona (el servidor valida que sumen 100 y recalcula su cumplimiento)
  async function guardarPesos(eid: number, pesos: Record<number, number | null>): Promise<boolean> {
    try { await guardarPesosKpi(eid, pesos); await cargarDatos(); return true; }
    catch (e) { alert(mensajeDeError(e)); return false; }
  }

  // Vincula un KPI a un resultado clave de su área (null = KPI operativo)
  async function vincularKpi(kpiId: number, krId: number | null) {
    const { error } = await supabase.from('indicadores').update({ kr_id: krId }).eq('id', kpiId);
    if (error) alert(/kr_id/.test(error.message) ? 'Falta aplicar la migración 20261123_okr.sql en Supabase.' : 'No se pudo vincular: ' + error.message);
    recargarDatos();
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
  const consultaBusqueda = normalizarTexto(filtroArbol);
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
    if (!texto) setFiltroArbol('');
  }

  // Resultado elegido en el buscador: la persona se ubica en "Mi equipo"; el área, en "Por áreas"
  function irAPersona(emp: Empleado) {
    setVista('tablero'); setPestanaInicio('equipo');
    setSeleccionPersona({ id: emp.id, marca: Date.now() });
  }
  function irAArea(area: Area) {
    setFiltroArbol(''); setVista('tablero'); setPestanaInicio('areas');
    setAreaRevelada(area.id); setAreaResaltada(area.id);
    setTimeout(() => setAreaResaltada(actual => (actual === area.id ? null : actual)), 5000);
  }
  function filtrarArbol() {
    setFiltroArbol(busqueda); setVista('tablero'); setPestanaInicio('areas');
  }


  const nombrePorId = new Map<number, string>([
    ...directorio.map(e => [e.id, e.nombre] as [number, string]),
    ...empleadosDesvinculados.map(e => [e.id, `${e.nombre} (desvinculado)`] as [number, string]),
  ]);
  // Organigrama: con desempeño para Admin/Auditor; informativo (sin cumplimiento) para el resto
  const verDesempenoEnOrganigrama = esAdmin || esAuditor;
  const empleadosOrganigrama: Empleado[] = verDesempenoEnOrganigrama
    ? empleados
    : directorio.map(e => ({ ...e, email: '', cumplimiento_general: 0 }));

  if (loading) return <div className="p-10 text-center text-slate-500 font-medium w-full h-screen flex items-center justify-center bg-slate-50">Iniciando Plataforma Corporativa...</div>

  // Objeto de funciones tipado que se pasa a TarjetaEmpleado
  const funcionesTarjeta: FuncionesTarjeta = {
    asignarAreaEmpleado, calificarKpi, periodos: infoPeriodos, esAdmin, okr: okrAnio ?? undefined, vincularKpi, guardarPesos, agregarIndicador, crearPlan, completarPlan,
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
    <div className="flex h-screen bg-fondo overflow-hidden font-sans">
      
      {/* ========================================== */}
      {/* 1. MENÚ LATERAL IZQUIERDO (SIDEBAR)        */}
      {/* ========================================== */}
      <aside className="w-[260px] bg-marca-900 bg-gradient-to-b from-marca-900 to-marca-950 flex flex-col z-20 hidden md:flex shrink-0">
        
        {/* Marca AlemiaHR y empresa */}
        {/* Franja blanca: el logo a color usa el mismo azul del menú y no se vería sobre él */}
        <div className="h-16 flex items-center px-5 bg-white border-b border-marca-100 shrink-0">
          <Logo variante="color" tamano="sm" />
        </div>
        {nombreEmpresa && (
          <div className="px-5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-marca-300">Organización</p>
            <p className="text-sm font-semibold text-white truncate" title={nombreEmpresa}>{nombreEmpresa}</p>
          </div>
        )}

        {/* Links de Navegación */}
        <div className="flex-1 overflow-y-auto py-5 px-4 space-y-6 custom-scrollbar">
          
          <div>
            <p className="px-3 text-[10px] font-bold uppercase text-marca-300 tracking-wider mb-2">Mi Espacio</p>
            <div className="space-y-1">
              <BotonLateral icono="🏠" texto="Inicio" activo={vista === 'tablero'} onClick={() => setVista('tablero')} visible={puedeVerTablero} />
              <BotonLateral icono="👤" texto="Mi Perfil" activo={vista === 'mi_perfil'} onClick={() => setVista('mi_perfil')} visible={true} />
              <BotonLateral icono="🗂️" texto="Organigrama" activo={vista === 'organigrama'} onClick={() => setVista('organigrama')} visible={true} />
              <BotonLateral icono="⚙️" texto="Estructura" activo={vista === 'estructura'} onClick={() => setVista('estructura')} visible={esAdmin} />
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase text-marca-300 tracking-wider mb-2">Talento</p>
            <div className="space-y-1">
              <BotonLateral icono="📋" texto="Desempeño (BI)" activo={vista === 'informes'} onClick={() => setVista('informes')} visible={puedeVerTablero} />
              <BotonLateral icono="🎯" texto="Objetivos (OKR)" activo={vista === 'okr'} onClick={() => setVista('okr')} visible={true} />
              <BotonLateral icono="⭐" texto="Evaluaciones 360" activo={vista === 'evaluaciones'} onClick={() => setVista('evaluaciones')} visible={true} />
            </div>
          </div>
          
        </div>
        <p className="px-5 py-4 text-[9px] font-titulo font-semibold uppercase tracking-[0.18em] text-marca-400 border-t border-white/10">Performance Platform</p>
      </aside>

      {/* ========================================== */}
      {/* 2. ÁREA CENTRAL (HEADER + CONTENIDO)       */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* HEADER SUPERIOR */}
        <header className="h-16 bg-white/90 backdrop-blur flex items-center justify-between px-6 border-b border-marca-100 z-10 shrink-0">
          <h1 className="text-sm font-bold text-marca-900 flex items-center gap-2">
            <span className="text-slate-500 font-medium">Página de inicio</span>
            {vista !== 'tablero' && <span className="text-slate-300">/</span>}
            {vista !== 'tablero' && <span className="text-acento-700 capitalize">{vista.replace('_', ' ')}</span>}
          </h1>
          
          <div className="flex items-center gap-4">
            {/* Buscador: filtra áreas y colaboradores */}
            {puedeBuscar && (
              <BuscadorGlobal valor={busqueda} onCambiar={cambiarBusqueda} empleados={empleados} areas={areasVisibles}
                onElegirPersona={irAPersona} onElegirArea={irAArea} onVerTodos={filtrarArbol} />
            )}
            <ChipPeriodo cerrados={infoPeriodos.cerrados} diasLimite={infoPeriodos.diasLimite} esAdmin={esAdmin}
              onCerrar={esAdmin && infoPeriodos.disponible ? () => setModalCorteAbierto(true) : undefined} />
            {esAuditor && (
              <span className="text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full">
                👁️ Modo Auditoría (Solo Lectura)
              </span>
            )}

            {tieneEquipo && (
              <span className="text-[11px] font-bold bg-marca-50 text-marca-700 border border-marca-200 px-3 py-1 rounded-full" title="Ves las áreas que lideras y sus sub-áreas; puedes editar solo a tus reportes directos">
                🧭 Vista de equipo ({directosIds.size} directo{directosIds.size === 1 ? '' : 's'} · {Math.max(dataParaMetricas.length - directosIds.size, 0)} en cascada)
              </span>
            )}

            {esAdmin && (
              <>

                <button
                  onClick={abrirModalInvitacion}
                  className="bg-acento-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-acento-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <span>🔑</span> Dar Acceso
                </button>

                <button
                  onClick={() => setImportacionAbierta(true)}
                  className="text-slate-600 hover:text-marca-950 text-xs font-bold transition flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200"
                  title="Crear y actualizar colaboradores desde Excel"
                >
                  <span>📥</span> Importar
                </button>
              </>
            )}
            
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4 ml-2">
              <div className="hidden md:block text-right">
                <p className="text-xs font-bold text-slate-700 leading-tight">{perfil?.nombre}</p>
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-[10px] text-slate-400 hover:text-red-500 hover:underline leading-tight transition-colors">Cerrar Sesión</button>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-acento-400 to-acento-600 text-white flex items-center justify-center text-sm font-titulo font-bold shadow-sm ring-2 ring-acento-100">
                {perfil?.nombre?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* CONTENIDO PRINCIPAL (El que hace Scroll) */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar relative">
          <div className="max-w-[1200px] mx-auto">
            {(esAdmin || directosIds.size > 0) && (
              <div className="mb-6">
                <AvisosPeriodo
                  personas={esAdmin ? empleados : empleados.filter(e => directosIds.has(e.id))}
                  cerrados={infoPeriodos.cerrados} diasLimite={infoPeriodos.diasLimite} esAdmin={esAdmin} disponible={infoPeriodos.disponible}
                />
              </div>
            )}
{/* --- CONTENIDO: TABLERO ADMIN --- */}
            {puedeVerTablero && vista === 'tablero' && (
              <div className="animate-in fade-in space-y-6">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Vista del inicio">
                  {([['equipo', '👥 Mi equipo'], ['areas', '🏢 Por áreas']] as const).map(([id, texto]) => (
                    <button key={id} type="button" role="tab" aria-selected={pestanaInicio === id} onClick={() => setPestanaInicio(id)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition ${pestanaInicio === id ? 'bg-marca-900 text-white shadow-sm' : 'bg-white text-marca-600 border border-marca-100 hover:bg-marca-50'}`}>
                      {texto}
                    </button>
                  ))}
                </div>

                {pestanaInicio === 'equipo' && (
                  <MiEquipo empleados={empleados} areas={areas} yo={miDesempeno} puedeEditar={puedeEditarColaborador} funciones={funcionesTarjeta} seleccion={seleccionPersona} />
                )}

                {pestanaInicio === 'areas' && (
                <div className="space-y-8">

                {/* Resumen de la búsqueda */}
                {resultadoBusqueda && (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-5 py-3 text-xs">
                    <span className="text-slate-600">
                      🔍 <strong className="text-marca-900">&quot;{filtroArbol.trim()}&quot;</strong>:{' '}
                      {resultadoBusqueda.totalAreas} área(s) y {resultadoBusqueda.totalEmpleados} colaborador(es) encontrados
                    </span>
                    <button type="button" onClick={() => { setFiltroArbol(''); setBusqueda(''); }} className="font-bold text-acento-700 hover:underline">
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
                    revelar={areaRevelada ? ancestrosDe(areaRevelada, areas) : []}
                    renderArea={({ area, ruta }) => {
                      const miembrosArea = empleados.filter(e => e.area_id === area.id);
                      // Con búsqueda: si coincide el nombre del área se ven todos; si no, solo los colaboradores que coinciden
                      const coincideArea = resultadoBusqueda?.areasCoincidentes.has(area.id);
                      const empCoinciden = resultadoBusqueda?.empleadosCoincidentesPorArea.get(area.id) || [];
                      const empleadosVisibles = resultadoBusqueda && !coincideArea ? empCoinciden : undefined;
                      return (
                        <TarjetaSaludArea
                          area={area}
                          resaltada={areaResaltada === area.id}
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
                    <h3 className="text-sm font-bold text-marca-900 mb-1">👤 Reportes de otras áreas</h3>
                    <p className="text-[11px] text-slate-500 mb-4">Te tienen como jefe directo aunque pertenecen a un área que no lideras.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {reportesFueraDeArea.filter(e => coincideEmpleado(e, consultaBusqueda)).map(emp => (
                        <TarjetaEmpleado key={emp.id} emp={emp} esLider={false} areas={areas} allowEdit={puedeEditarColaborador(emp)} funciones={funcionesTarjeta} />
                      ))}
                    </div>
                  </div>
                )}

                </div>
                )}
              </div>
            )}

            {/* --- CONTENIDO: ESTRUCTURA (Admin) --- */}
            {esAdmin && vista === 'estructura' && (
              <div className="animate-in fade-in space-y-8">
                <div>
                  <h2 className="text-2xl font-extrabold text-marca-900">⚙️ Estructura</h2>
                  <p className="text-sm text-slate-500">Áreas, cargos, alta de colaboradores y asignaciones pendientes.</p>
                </div>
                    {/* Panel superior: Crear Área, catálogo de cargos y Nuevo Colaborador */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Crear Área */}
                      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nueva Área</label>
                          <input
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-marca-950 outline-none focus:border-acento-500"
                            placeholder="Ej: Ventas..."
                            value={nuevaAreaNombre}
                            onChange={e => setNuevaAreaNombre(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Reporta a</label>
                          <select
                            className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs text-slate-700 outline-none focus:border-acento-500"
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
                          className="bg-marca-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-marca-800 transition h-[34px]"
                        >
                          + Área
                        </button>
                      </div>

                      {/* Catálogo de cargos */}
                      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cargos ({puestos.length})</span>
                          <p className="text-xs text-slate-600">
                            {niveles.length} nivel(es) · cada cargo pertenece a un área
                            {puestos.some(p => p.area_id == null) && (
                              <span className="block text-[11px] font-semibold text-amber-700">◐ {puestos.filter(p => p.area_id == null).length} cargo(s) sin área por completar</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={abrirCatalogoCargos}
                          className="bg-marca-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-marca-800 transition h-[34px]"
                        >
                          💼 Gestionar cargos
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalNuevoEmpAbierto(true)}
                          className="bg-acento-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-acento-700 transition h-[34px] shadow-sm"
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
                                <h3 className="text-sm font-bold text-marca-900">Pendientes de Estructura Organizacional</h3>
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
                                    className="accent-acento-600 rounded"
                                  />
                                  Seleccionar todos ({sinArea.length})
                                </label>

                                <div className="flex items-center gap-2">
                                  <select
                                    value={areaDestinoBloque}
                                    onChange={(e) => setAreaDestinoBloque(e.target.value)}
                                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 outline-none focus:border-acento-500"
                                  >
                                    <option value="">-- Elegir Área destino --</option>
                                    {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={asignarAreaEnBloque}
                                    disabled={asignandoBloque || seleccionadosSinArea.length === 0 || !areaDestinoBloque}
                                    className="bg-marca-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-marca-800 transition disabled:opacity-40"
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
                                        marcado ? 'bg-acento-50/60 border-acento-400/60' : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={() => setSeleccionadosSinArea(prev =>
                                          prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                                        )}
                                        className="accent-acento-600"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="font-bold text-marca-900 truncate">{emp.nombre}</p>
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
                {/* Ex-colaboradores: se conservan para el histórico */}
                {esAdmin && (
                  <SeccionDesvinculados
                    desvinculados={empleadosDesvinculados.filter(e => coincideEmpleado(e, consultaBusqueda))}
                    areas={areas}
                    onVerHistorial={(emp) => setEmpleadoViendoPerfil(emp)}
                    onReactivar={reactivarColaborador}
                  />
                )}

              </div>
            )}

            {/* Paneles de alta/edición y desvinculación (se abren desde cualquier vista) */}
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
            {vista === 'okr' && <VistaOKR areas={areas} directorio={directorio} onCambio={recargarDatos} />}

            {vista === 'evaluaciones' && (
              <Vista360 areas={areas} onCambio={recargarDatos} historico={evaluaciones.length > 0 ? (
                <ReporteEvaluaciones
                  titulo="📋 Evaluaciones del modelo anterior"
                  evaluaciones={(esAdmin || esAuditor) ? evaluaciones : evaluaciones.filter(ev => ev.evaluador_id === miDesempeno?.id || (ev.evaluado_id !== miDesempeno?.id && dataParaMetricas.some(e => e.id === ev.evaluado_id)))}
                  nombrePorId={nombrePorId}
                  anonimizarAscendentes
                  vacio="No hay evaluaciones del modelo anterior."
                />
              ) : undefined} />
            )}

            {/* --- CONTENIDO: INFORMES (BI) --- */}
            {vista === 'informes' && puedeVerTablero && (
              <PanelBI
                empleados={dataParaMetricas}
                areasAlcance={areasVisibles}
                areas={areas}
                etiquetaAlcance={esAdmin || esAuditor ? '🏢 Toda la organización' : `🧭 Tu equipo (${dataParaMetricas.length})`}
                onVerFicha={(emp) => setEmpleadoViendoPerfil(emp)}
                onAbrirImportacion={esAdmin ? () => setImportacionAbierta(true) : undefined}
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
                  {/* 0. Mensaje de progreso */}
                  <BandaProgreso mensaje={mensajeProgreso(miDesempeno, umbrales, variacion)} />

                  <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-marca-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-acento-700 bg-acento-50 px-3 py-1 rounded-full border border-acento-100">
                        Mi desarrollo
                      </span>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-marca-900 mt-2">{miDesempeno.nombre}</h2>
                      <p className="text-marca-500 font-medium text-xs md:text-sm">{miDesempeno.puesto}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="text-[11px] font-semibold text-marca-700 bg-marca-50 border border-marca-100 px-3 py-1 rounded-full">
                          Potencial: {etiquetaPotencial(miDesempeno.potencial_score)}
                        </span>
                        {variacion !== null && (
                          <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                            variacion >= 0 ? 'bg-acento-50 border-acento-200 text-acento-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}>
                            {variacion >= 0 ? `▲ +${variacion} pts vs. período anterior` : `Oportunidad: ${variacion} pts vs. período anterior`}
                          </span>
                        )}
                      </div>
                      {miDesempeno.job_descripcion && (
                        <p className="text-xs text-marca-500 mt-3 max-w-xl bg-marca-50/60 p-3 rounded-xl border border-marca-100">
                          {miDesempeno.job_descripcion}
                        </p>
                      )}
                    </div>

                    <AnilloProgreso valor={miDesempeno.cumplimiento_general} etiqueta="Cumplimiento" />
                  </div>

                  {/* 1b. Logros */}
                  <Logros logros={logrosDe(miDesempeno)} />

                  {/* 2. Gráfica de Curva de Cumplimiento a través del tiempo */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                      <div>
                        <h3 className="text-base font-bold text-marca-900 flex items-center gap-2">
                          📈 Curva de Cumplimiento a través del Tiempo
                        </h3>
                        <p className="text-xs text-slate-400">
                          Histórico consolidado por periodo ({historicoOrdenado.length} {historicoOrdenado.length === 1 ? 'registro' : 'registros'})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-semibold">
                          Nivel alto desde: <strong>{umbrales.umbral_desempeno_alto}%</strong>
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
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
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
                              y={umbrales.umbral_desempeno_alto} 
                              stroke="#10b981" 
                              strokeDasharray="4 4" 
                              label={{ value: `Nivel alto ${umbrales.umbral_desempeno_alto}%`, position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} 
                            />
                            <RechartsArea 
                              type="monotone" 
                              dataKey="cumplimiento" 
                              stroke="#10B981" 
                              strokeWidth={3} 
                              fillOpacity={1} 
                              fill="url(#curvaCumplimiento)" 
                              dot={{ fill: '#0F2942', stroke: '#fff', strokeWidth: 2, r: 5 }}
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
                    <h3 className="text-base font-bold text-marca-900 mb-4">🎯 Mis Indicadores (KPIs)</h3>
                    <div className="space-y-4">
                      {miDesempeno.indicadores && miDesempeno.indicadores.length > 0 ? (
                        miDesempeno.indicadores.map(ind => (
                          <div key={ind.id} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-marca-900">{ind.titulo}</span>
                                <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase font-bold">
                                  {ind.periodo || 'trimestral'}
                                </span>
                              </div>
                              <span className="font-black text-marca-900">{ind.progreso}%</span>
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
                                className="h-full bg-gradient-to-r from-acento-400 to-acento-600 rounded-full transition-all duration-500" 
                                style={{ width: `${ind.progreso}%` }}
                              />
                            </div>
                            {ind.feedback_lider && (
                              <div className="mt-3 text-[11px] text-slate-600 bg-white p-3 rounded-lg border border-slate-200/70">
                                <strong className="text-marca-900 font-semibold block mb-0.5">Feedback del líder:</strong>
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

            {/* CIERRE GUIADO DE PERÍODO (Admin) */}
            {modalCorteAbierto && esAdmin && (
              <AsistenteCierre
                empleados={empleados}
                areas={areas}
                cerrados={infoPeriodos.cerrados}
                diasLimite={infoPeriodos.diasLimite}
                onClose={() => setModalCorteAbierto(false)}
                onCambio={recargarDatos}
              />
            )}

            {/* MODAL DE INVITACIONES INTELIGENTES */}
            {modalInvitarAbierto && (
              <ModalAccesos
                candidatos={empleados.filter(e => e.email !== perfil?.email)}
                onClose={() => { setModalInvitarAbierto(false); recargarDatos(); }}
                onOtorgar={otorgarAccesos}
              />
            )}
                {/* Catálogo de cargos y niveles */}
                {esAdmin && catalogoAbierto && (
                  <CatalogoCargos
                    puestos={puestos}
                    areas={areas}
                    niveles={niveles}
                    empleados={[...empleados, ...empleadosDesvinculados]}
                    rangos={rangosCargo}
                    monedaPrincipal={monedaPreferida}
                    onGuardarCargo={guardarCargo}
                    onEliminarCargo={eliminarCargo}
                    onGuardarNivel={guardarNivel}
                    onEliminarNivel={eliminarNivel}
                    onOrdenarNiveles={ordenarNiveles}
                    onClose={() => setCatalogoAbierto(false)}
                  />
                )}
                {/* Asistente de importación masiva (crear y actualizar desde Excel) */}
                {esAdmin && importacionAbierta && (
                  <AsistenteImportacion
                    activos={empleados}
                    desvinculados={empleadosDesvinculados}
                    areas={areas}
                    puestos={puestos}
                    emailImportador={perfil?.email || ''}
                    onClose={() => setImportacionAbierta(false)}
                    onAplicado={async (creadosIds, darAccesoNuevos) => {
                      recargarDatos();
                      if (!darAccesoNuevos) return;
                      try { setAccesoRecienCreado(await otorgarAccesos(creadosIds)); }
                      catch (e) { alert(`La importación se aplicó, pero no se pudieron generar los accesos:\n${mensajeDeError(e)}\n\nPuedes hacerlo desde "Dar Acceso".`); }
                    }}
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
