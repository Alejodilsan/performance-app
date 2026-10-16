'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- TIPOS DE DATOS ---
interface Area { id: number; nombre: string; lider_id: number | null; parent_id: number | null; children?: Area[]; empleados?: Empleado[]; }
interface Indicador { id: number; titulo: string; progreso: number; descripcion?: string; unidad_medida?: string; meta_esperada?: number; resultado_actual?: number; }
interface Comentario { id: number; autor: string; texto: string; created_at: string; }
interface Plan { id: number; compromiso: string; estado: string; fecha_limite: string; created_at: string; comentarios?: Comentario[]; }
interface Evaluacion { id: number; evaluador_id: number; evaluado_id: number; tipo: string; puntuacion: number; feedback: string; created_at: string; }
interface Empleado { id: number; nombre: string; puesto: string; email: string; cumplimiento_general: number; area_id: number | null; potencial_score?: 1 | 2 | 3; indicadores?: Indicador[]; planes_mejora?: Plan[]; }

interface Perfil {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'empleado';
  empresa_id: number;
}

interface FuncionesTarjeta {
  asignarAreaEmpleado: (eid: number, aid: string) => Promise<void>;
  actualizarIndicador: (id: number, val: number, eid: number) => Promise<void>;
  actualizarPotencial: (eid: number, val: number) => Promise<void>;
  agregarIndicador: (eid: number, datosKpi: any) => Promise<void>; // <--- Asegúrate de que esta línea esté así
  eliminarIndicador: (id: number) => Promise<void>; // <--- Asegúrate de que esta línea exista
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
}

interface PropsTarjeta {
  emp: Empleado;
  esLider: boolean;
  areas: Area[];
  allowEdit: boolean;
  funciones: FuncionesTarjeta;
}

interface PropsVista360 {
  miDesempeno: Empleado | null;
  esLider: boolean;
  equipo: Empleado[];
  miLider: Empleado | undefined;
  evaluaciones: Evaluacion[];
  onSave: (evaluadoId: number, tipo: string, puntuacion: number, feedback: string) => Promise<void>;
}

interface PropsFormEval {
  evaluado: Empleado;
  tipo: string;
  titulo: string;
  descripcion: string;
  miId: number;
  evaluaciones: Evaluacion[];
  onSave: (evaluadoId: number, tipo: string, puntuacion: number, feedback: string) => Promise<void>;
  colorTheme: 'purple' | 'blue' | 'emerald';
}

export default function DashboardPerformance() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [invitando, setInvitando] = useState(false)
  // Estados para el Modal de Invitaciones Inteligentes
  const [modalInvitarAbierto, setModalInvitarAbierto] = useState(false);
  const [empleadosSeleccionadosParaInvitar, setEmpleadosSeleccionadosParaInvitar] = useState<number[]>([]);
  
  const [esLider, setEsLider] = useState(false)
  const [areaLiderada, setAreaLiderada] = useState<Area | null>(null)
  const [equipoLiderado, setEquipoLiderado] = useState<Empleado[]>([])
  const [vista, setVista] = useState<'tablero' | 'organigrama' | 'informes' | 'mi_equipo' | 'mi_perfil' | 'evaluaciones'>('tablero')

  const [nombre, setNombre] = useState(''); const [puesto, setPuesto] = useState(''); const [emailEmpleado, setEmailEmpleado] = useState('');
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState(''); const [nuevaAreaPadre, setNuevaAreaPadre] = useState<string>("");
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [nuevosIndicadores, setNuevosIndicadores] = useState<{ [key: number]: string }>({});
  const [textosPlanes, setTextosPlanes] = useState<{ [key: number]: string }>({}); const [diasPlanes, setDiasPlanes] = useState<{ [key: number]: number }>({});
  const [planChatAbierto, setPlanChatAbierto] = useState<number | null>(null);
  const [nuevosComentarios, setNuevosComentarios] = useState<{ [key: number]: string }>({});
  const [nombreEmpresa, setNombreEmpresa] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

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
    const { data: perfilData } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    setPerfil(perfilData)
    
    if (perfilData?.rol === 'admin') { 
      await obtenerDatosCorporativos(perfilData); 
    } else { 
      await identificarRolEmpleado(session.user.email!); 
    }
    
    setLoading(false);
  }

  async function obtenerDatosCorporativos(perfilDeAcceso: Perfil) {
    if (!perfilDeAcceso?.empresa_id) return;
    const { data: areasData } = await supabase.from('areas').select('*').eq('empresa_id', perfilDeAcceso?.empresa_id).order('id');
    const { data: empData } = await supabase
      .from('empleados')
      .select('*, indicadores(*), planes_mejora(*, comentarios(*))')
      .eq('empresa_id', perfilDeAcceso?.empresa_id)
      .order('id', { ascending: true });
    const { data: evalData } = await supabase.from('evaluaciones').select('*').eq('empresa_id', perfilDeAcceso?.empresa_id);
    if (areasData) setAreas(areasData); if (evalData) setEvaluaciones(evalData);
    if (empData) {
      const dataOrdenada = empData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a: Plan, b: Plan) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) }))
      setEmpleados(dataOrdenada)
      const miFicha = dataOrdenada.find((e: any) => e.email === perfilDeAcceso?.email);
      if (miFicha) setMiDesempeno(miFicha);
    }
    const { data: empresaData } = await supabase
      .from('empresas')
      .select('nombre')
      .eq('id', perfilDeAcceso?.empresa_id)
      .single();
    if (empresaData) {
      setNombreEmpresa(empresaData.nombre);
    }
  }

  async function identificarRolEmpleado(email: string) {
    const { data: miData } = await supabase
      .from('empleados')
      .select('*, indicadores(*), planes_mejora(*, comentarios(*))')
      .eq('email', email)
      .single();

    if (!miData) return;

    const { data: areasData } = await supabase
      .from('areas')
      .select('*')
      .eq('empresa_id', miData.empresa_id)
      .order('id');
    const { data: evalData } = await supabase
      .from('evaluaciones')
      .select('*')
      .eq('empresa_id', miData.empresa_id);

    if (areasData) setAreas(areasData);
    if (evalData) setEvaluaciones(evalData);

    setMiDesempeno({ ...miData, planes_mejora: miData.planes_mejora.sort((a: Plan, b: Plan) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) });
    const { data: areaLider } = await supabase.from('areas').select('*').eq('lider_id', miData.id).single();
    if (areaLider) {
      setEsLider(true); setAreaLiderada(areaLider); setVista('mi_equipo');
      const { data: equipoData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').eq('area_id', areaLider.id).order('id');
      if (equipoData) setEquipoLiderado(equipoData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a: Plan, b: Plan) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) })));
    } else { setVista('mi_perfil'); }
  }

  const recargarDatos = () => { if (perfil?.rol === 'admin') obtenerDatosCorporativos(perfil); else if (perfil?.email) identificarRolEmpleado(perfil.email); }

  const descargarPlantilla = () => {
    // Datos de ejemplo para que el HR Manager sepa cómo llenar el Excel
    const datosEjemplo = [
      {
        "Nombre": "Ejemplo: Ana López",
        "Email": "ana.lopez@empresa.com",
        "Puesto": "Desarrolladora Senior",
        "Area": "Tecnología",
        "Reporta A": "Operaciones"
      },
      {
        "Nombre": "Ejemplo: Carlos Ruiz",
        "Email": "carlos@empresa.com",
        "Puesto": "Líder de Producto",
        "Area": "Producto",
        "Reporta A": "Operaciones"
      }
    ];

    // Crea la hoja de trabajo (worksheet) desde el objeto JSON
    const worksheet = XLSX.utils.json_to_sheet(datosEjemplo);

    // Auto-ajustar el ancho de las columnas para que se vea limpio
    worksheet['!cols'] = [
      { wch: 25 }, // Ancho columna Nombre
      { wch: 30 }, // Ancho columna Email
      { wch: 25 }, // Ancho columna Puesto
      { wch: 20 }, // Ancho columna Area
      { wch: 20 }  // Ancho columna Reporta A
    ];

    // Crea el libro de trabajo (workbook) y le añade la hoja
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Empleados");

    // Fuerza la descarga como archivo .xlsx nativo
    XLSX.writeFile(workbook, "Plantilla_Carga_Colaboradores.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file) return; 
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' }); 
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      let areasActivas = [...areas];
      const empresaId = perfil?.empresa_id;

      // 1. Filtro estricto: Guardamos todos los correos actuales limpios (sin espacios y en minúscula)
      const correosExistentes = new Set(empleados.map(emp => emp.email.trim().toLowerCase()));
      let agregados = 0;

      for (const row of data) {
        // Soporta varias formas en las que puede venir escrita la cabecera en el Excel
        const emailRow = row['Email'] || row['email'] || row['Correo'];
        if (!emailRow) continue;

        // Limpiamos espacios accidentales del Excel
        const emailLimpio = String(emailRow).trim().toLowerCase();

        // 2. Verificación total: Si ya existe en la BD o en esta misma carga, lo saltamos
        if (correosExistentes.has(emailLimpio)) continue; 
        
        // Lo añadimos a la lista de "ya procesados" para no duplicarlo si viene 2 veces
        correosExistentes.add(emailLimpio); 

        let parentId = null; let areaId = null; 
        const reportaARow = row['Reporta A'] || row['Reporta a']; 
        const areaRow = row['Area'] || row['area'];

        if (reportaARow) {
          const nombrePadre = String(reportaARow).trim();
          let padreExist = areasActivas.find(a => a.nombre.toLowerCase() === nombrePadre.toLowerCase());
          if (padreExist) parentId = padreExist.id;
          else { 
            const { data: nP } = await supabase.from('areas').insert([{ nombre: nombrePadre, empresa_id: empresaId }]).select().single(); 
            if (nP) { parentId = nP.id; areasActivas.push(nP); } 
          }
        }

        if (areaRow) {
          const nombreArea = String(areaRow).trim();
          let aExist = areasActivas.find(a => a.nombre.toLowerCase() === nombreArea.toLowerCase());
          if (aExist) { 
            areaId = aExist.id; 
            if (parentId && !aExist.parent_id) { 
              await supabase.from('areas').update({ parent_id: parentId }).eq('id', areaId); 
              aExist.parent_id = parentId; 
            } 
          }
          else { 
            const { data: nA } = await supabase.from('areas').insert([{ nombre: nombreArea, parent_id: parentId, empresa_id: empresaId }]).select().single(); 
            if (nA) { areaId = nA.id; areasActivas.push(nA); } 
          }
        }

        // Insertamos el empleado limpio
        await supabase.from('empleados').insert([{
          nombre: String(row['Nombre'] || row['nombre'] || 'Sin Nombre').trim(),
          email: emailLimpio,
          puesto: String(row['Puesto'] || row['puesto'] || 'Colaborador').trim(),
          area_id: areaId,
          cumplimiento_general: 0,
          empresa_id: empresaId
        }]);
        
        agregados++;
      }

      alert(`✅ Carga completada. Se agregaron ${agregados} nuevos colaboradores (se ignoraron los repetidos).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      recargarDatos();
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

  async function asignarPadreArea(aid: number, pid: string) { const npid = pid === "" ? null : parseInt(pid); if (npid === aid) return; await supabase.from('areas').update({ parent_id: npid }).eq('id', aid); recargarDatos(); }
  async function asignarLiderArea(aid: number, lid: string) { await supabase.from('areas').update({ lider_id: lid === "" ? null : parseInt(lid) }).eq('id', aid); recargarDatos(); }
  async function asignarAreaEmpleado(eid: number, aid: string) { await supabase.from('empleados').update({ area_id: aid === "" ? null : parseInt(aid) }).eq('id', eid); recargarDatos(); }
  async function agregarEmpleado(e: React.FormEvent) { e.preventDefault(); await supabase.from('empleados').insert([{ nombre, puesto, email: emailEmpleado, cumplimiento_general: 0, empresa_id: perfil?.empresa_id }]); recargarDatos(); }

  async function agregarIndicador(eid: number, datosKpi: any) {
    if (!datosKpi.titulo) return;
    await supabase.from('indicadores').insert([{ 
      empleado_id: eid, 
      titulo: datosKpi.titulo, 
      descripcion: datosKpi.descripcion,
      unidad_medida: datosKpi.unidad_medida,
      meta_esperada: datosKpi.meta_esperada,
      direccion: datosKpi.direccion || 'creciente', // Guardamos la dirección
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
    const targetList = perfil?.rol === 'admin' ? empleados : equipoLiderado;
    const setter = perfil?.rol === 'admin' ? setEmpleados : setEquipoLiderado;
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
  }

  async function actualizarPotencial(eid: number, nuevoPotencial: number) {
    const targetList = perfil?.rol === 'admin' ? empleados : equipoLiderado;
    const setter = perfil?.rol === 'admin' ? setEmpleados : setEquipoLiderado;
    setter(targetList.map(emp =>
      emp.id === eid ? { ...emp, potencial_score: nuevoPotencial as 1 | 2 | 3 } : emp
    ));
    await supabase.from('empleados').update({ potencial_score: nuevoPotencial }).eq('id', eid);
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
    await supabase.from('evaluaciones').insert([{ evaluador_id: miDesempeno.id, evaluado_id: evaluadoId, tipo, puntuacion, feedback }]);
    alert("Evaluación enviada"); recargarDatos();
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
  function abrirModalInvitacion() {
  const candidatos = empleados.filter(emp => emp.email !== perfil?.email);
  if (candidatos.length === 0) {
    alert("No hay colaboradores en la plataforma para invitar.");
    return;
  }
  setEmpleadosSeleccionadosParaInvitar(candidatos.map(e => e.id));
  setModalInvitarAbierto(true);
}

  const invitarEquipo = abrirModalInvitacion;

function toggleSeleccionInvitacion(id: number) {
  setEmpleadosSeleccionadosParaInvitar(prev => 
    prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]
  );
}

function toggleSeleccionarTodos() {
  const candidatos = empleados.filter(emp => emp.email !== perfil?.email);
  // Si ya están todos seleccionados, los deseleccionamos (vaciamos el array)
  if (empleadosSeleccionadosParaInvitar.length === candidatos.length) {
    setEmpleadosSeleccionadosParaInvitar([]);
  } else {
    // Si no están todos, los seleccionamos a todos
    setEmpleadosSeleccionadosParaInvitar(candidatos.map(e => e.id));
  }
}

async function confirmarInvitacionMasiva() {
  const empleadosAInvitar = empleados.filter(emp => empleadosSeleccionadosParaInvitar.includes(emp.id));
  
  if (empleadosAInvitar.length === 0) {
    alert("Debes seleccionar al menos un colaborador.");
    return;
  }

  setInvitando(true);
  try {
    const res = await fetch('/api/invitar', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ empleados: empleadosAInvitar }) 
    });
    
    const data = await res.json();
    
    if (res.ok) {
      alert(data.mensaje); 
      setModalInvitarAbierto(false);
      recargarDatos(); 
    } else {
      alert(`Error: ${data.mensaje}`);
    }
  } catch (error) { 
    alert("Error de conexión con el servidor."); 
  }
  setInvitando(false);
}

  const esAdmin = perfil?.rol === 'admin';
  const dataParaMetricas = esAdmin ? empleados : equipoLiderado;

  const metricasBI = useMemo(() => {
    const total = dataParaMetricas.length;
    const prom = total > 0 ? Math.round(dataParaMetricas.reduce((a, b) => a + b.cumplimiento_general, 0) / total) : 0;
    const bajo = dataParaMetricas.filter(e => e.cumplimiento_general < 60).length;
    const medio = dataParaMetricas.filter(e => e.cumplimiento_general >= 60 && e.cumplimiento_general < 85).length;
    const alto = dataParaMetricas.filter(e => e.cumplimiento_general >= 85).length;
    const distribucion = [{ name: 'Riesgo (<60%)', value: bajo, color: '#EF4444' }, { name: 'Estándar (60-85%)', value: medio, color: '#F59E0B' }, { name: 'Alto (>85%)', value: alto, color: '#10B981' }].filter(d => d.value > 0);
    const todosPlanes = dataParaMetricas.flatMap(e => e.planes_mejora || []);
    const pendientes = todosPlanes.filter(p => p.estado === 'pendiente').length;
    const completados = todosPlanes.filter(p => p.estado === 'completado').length;
    const ranking = [...dataParaMetricas].sort((a, b) => b.cumplimiento_general - a.cumplimiento_general);
    const top5 = ranking.slice(0, 5);
    const bottom5 = [...ranking].reverse().slice(0, 5).filter(e => e.cumplimiento_general < 70);
    const datosArea = areas.map(area => {
      const miembros = empleados.filter(e => e.area_id === area.id);
      const promArea = miembros.length > 0 ? Math.round(miembros.reduce((acc, curr) => acc + curr.cumplimiento_general, 0) / miembros.length) : 0;
      return { name: area.nombre, promedio: promArea, cantidad: miembros.length, lider: area.lider_id ? empleados.find(e => e.id === area.lider_id)?.nombre : 'Sin Asignar' };
    }).filter(d => d.cantidad > 0).sort((a, b) => b.promedio - a.promedio);
    const misEvals = esAdmin ? evaluaciones : evaluaciones.filter(ev => dataParaMetricas.some(emp => emp.id === ev.evaluado_id || emp.id === ev.evaluador_id));
    const promEvals = misEvals.length > 0 ? (misEvals.reduce((acc, curr) => acc + curr.puntuacion, 0) / misEvals.length).toFixed(1) : "0.0";
    const evalsPorTipo = [
      { name: 'Autoevaluación', value: misEvals.filter(e => e.tipo === 'autoevaluacion').length, fill: '#8b5cf6' },
      { name: 'Ascendente', value: misEvals.filter(e => e.tipo === 'ascendente').length, fill: '#ec4899' },
      { name: 'Descendente', value: misEvals.filter(e => e.tipo === 'descendente').length, fill: '#0ea5e9' }
    ].filter(d => d.value > 0);
    return { total, prom, distribucion, pendientes, completados, datosArea, top5, bottom5, promEvals, evalsPorTipo, totalEvals: misEvals.length };
  }, [dataParaMetricas, areas, empleados, evaluaciones, esAdmin]);

  const miAreaInfo = areas.find(a => a.id === miDesempeno?.area_id);
  const miLider = empleados.find(e => e.id === miAreaInfo?.lider_id);

  if (loading) return <div className="p-10 text-center text-slate-500 font-medium w-full h-screen flex items-center justify-center bg-slate-50">Iniciando Plataforma Corporativa...</div>

  // Objeto de funciones tipado que se pasa a TarjetaEmpleado
  const funcionesTarjeta: FuncionesTarjeta = {
  asignarAreaEmpleado, actualizarIndicador, actualizarPotencial, agregarIndicador, crearPlan, completarPlan,
  setExpandidoId, expandidoId, nuevosIndicadores, setNuevosIndicadores, textosPlanes, setTextosPlanes,
  diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevosComentarios, setNuevosComentarios,
  eliminarIndicador, 
};

  // --- AQUI EMPIEZA EL NUEVO LAYOUT VISUAL ---
  return (
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
              <BotonLateral icono="🏠" texto="Inicio" activo={vista === 'tablero'} onClick={() => setVista('tablero')} visible={esAdmin} />
              <BotonLateral icono="👤" texto="Mi Perfil" activo={vista === 'mi_perfil'} onClick={() => setVista('mi_perfil')} visible={!esAdmin} />
              <BotonLateral icono="👥" texto="Mi Equipo" activo={vista === 'mi_equipo'} onClick={() => setVista('mi_equipo')} visible={esLider && !esAdmin} />
              <BotonLateral icono="🗂️" texto="Organigrama" activo={vista === 'organigrama'} onClick={() => setVista('organigrama')} visible={esAdmin} />
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Talento</p>
            <div className="space-y-1">
              <BotonLateral icono="📋" texto="Desempeño (BI)" activo={vista === 'informes'} onClick={() => setVista('informes')} visible={esAdmin || esLider} />
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
            {/* Buscador ficticio para igualar diseño */}
            <div className="hidden lg:flex items-center bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-sm text-slate-400">
               <span className="mr-2">🔍</span> Buscar...
            </div>

            <button onClick={abrirModalInvitacion} disabled={invitando} className="bg-[#FF4C4C] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-red-600 transition disabled:opacity-50 flex items-center gap-2">
              <span>✨</span> {invitando ? 'Enviando...' : 'Invitar Equipo'}
            </button>
            
            {esAdmin && (
               <div className="flex items-center gap-2">
                 <button onClick={descargarPlantilla} className="text-slate-500 hover:text-slate-800 text-xs font-bold transition flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200">
                   <span>⬇️</span> Plantilla
                 </button>
                 
                 <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                 
                 <button onClick={() => fileInputRef.current?.click()} className="text-slate-500 hover:text-slate-800 text-xs font-bold transition flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200">
                   <span>⬆️</span> Subir Excel
                 </button>
               </div>
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
            {esAdmin && vista === 'tablero' && (
              <div className="animate-in fade-in space-y-8">
                
                {/* Panel superior de Creación (Estilo Tarjeta Blanca Limpia) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva Área</label>
                    <input className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#FF4C4C] focus:ring-1 focus:ring-[#FF4C4C] transition-all" placeholder="Ej: Operaciones..." value={nuevaAreaNombre} onChange={e => setNuevaAreaNombre(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jerarquía</label>
                    <select className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-slate-700 outline-none focus:border-[#FF4C4C] transition-all" value={nuevaAreaPadre} onChange={e => setNuevaAreaPadre(e.target.value)}>
                      <option value="">-- Área Principal --</option>
                      {areas.map(a => <option key={a.id} value={a.id}>Dentro de: {a.nombre}</option>)}
                    </select>
                  </div>
                  <button onClick={crearArea} className="bg-slate-800 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-900 transition-colors h-[42px]">Crear Área</button>
                </div>

                {/* Lista de Áreas con Health Cards */}
                <div className="space-y-6">
                  {areas.map(area => {
                    const miembrosArea = empleados.filter(e => e.area_id === area.id);
                    return (
                      <TarjetaSaludArea
                        key={area.id}
                        area={area}
                        empleadosArea={miembrosArea}
                        todosLosEmpleados={empleados}
                        todasLasAreas={areas}
                        estaAbierta={!!areasAbiertas[area.id]}
                        onToggle={() => toggleArea(area.id)}
                        funcionesTarjeta={funcionesTarjeta}
                        asignarLiderArea={asignarLiderArea}
                        asignarPadreArea={asignarPadreArea}
                        calcularGantt={calcularGantt}
                      />
                    );
                  })}
                </div>

                {/* Botón Flotante para Agregar Empleado Manual */}
                <div className="fixed bottom-8 right-8 bg-white p-3 rounded-full shadow-[0_10px_25px_-5px_rgba(0,0,0,0.2)] flex gap-2 border border-slate-100 z-50">
                  <form onSubmit={agregarEmpleado} className="flex gap-2">
                    <input className="bg-slate-50 border border-slate-200 rounded-full px-4 text-sm w-36 outline-none focus:border-[#FF4C4C]" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} required />
                    <input className="bg-slate-50 border border-slate-200 rounded-full px-4 text-sm w-48 outline-none focus:border-[#FF4C4C]" placeholder="Email" value={emailEmpleado} onChange={e => setEmailEmpleado(e.target.value)} required />
                    <button className="bg-[#FF4C4C] text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg hover:bg-red-600 transition shadow-sm">+</button>
                  </form>
                </div>
              </div>
            )}

            {/* --- CONTENIDO: MI EQUIPO (Líder) --- */}
            {!esAdmin && vista === 'mi_equipo' && (
              <div className="animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {equipoLiderado.map(emp => (
                    <TarjetaEmpleado key={emp.id} emp={emp} esLider={false} areas={areas} allowEdit={true} funciones={{ ...funcionesTarjeta, asignarAreaEmpleado: async () => {} }} />
                  ))}
                </div>
              </div>
            )}

            {/* --- CONTENIDO: ORGANIGRAMA --- */}
            {esAdmin && vista === 'organigrama' && (
              <div className="bg-slate-100 p-8 rounded-2xl overflow-x-auto overflow-y-auto h-[750px] flex justify-center items-start animate-in zoom-in-95 border border-slate-200 shadow-inner custom-scrollbar relative">
                <div className="absolute top-4 left-4 text-slate-300 font-bold text-2xl tracking-widest opacity-50 select-none">ESTRUCTURA ORGANIZACIONAL</div>
                <div className="flex gap-16 pb-32 pt-10">
                  {construirArbol(areas, empleados).map(areaRaiz => (<NodoOrganigrama key={areaRaiz.id} area={areaRaiz} />))}
                </div>
              </div>
            )}

            {/* --- CONTENIDO: EVALUACIONES 360 --- */}
            {vista === 'evaluaciones' && (esAdmin ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
                <div className="p-6 border-b border-slate-100 bg-slate-50"><h3 className="font-bold text-slate-800">📋 Reporte Global de Evaluaciones 360</h3></div>
                <div className="p-6 grid gap-4">
                  {evaluaciones.length === 0 ? <p className="text-slate-400">Nadie ha enviado evaluaciones aún.</p> : evaluaciones.map(ev => {
                    const evaluador = empleados.find(e => e.id === ev.evaluador_id)?.nombre;
                    const evaluado = empleados.find(e => e.id === ev.evaluado_id)?.nombre;
                    return (
                      <div key={ev.id} className="p-4 border border-slate-100 bg-slate-50 rounded-xl flex items-start gap-4">
                        <div className="text-2xl pt-1">{'⭐'.repeat(ev.puntuacion)}</div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{evaluador} <span className="text-slate-400 font-normal">evaluó a</span> {evaluado}</p>
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{ev.tipo}</span>
                          <p className="text-sm text-slate-600 mt-2 italic">"{ev.feedback}"</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (<VistaEvaluaciones360 miDesempeno={miDesempeno} esLider={esLider} equipo={equipoLiderado} miLider={miLider} evaluaciones={evaluaciones} onSave={guardarEvaluacion} />))}

            {/* --- CONTENIDO: INFORMES (BI) --- */}
            {vista === 'informes' && (
              <div className="animate-in slide-in-from-bottom-4 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-sm text-white border border-slate-700">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Rendimiento</p>
                    <h3 className="text-4xl font-black">{metricasBI.prom}%</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Headcount</p>
                    <h3 className="text-3xl font-black text-slate-800">{metricasBI.total}</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Planes Abiertos</p>
                    <h3 className="text-3xl font-black text-amber-500">{metricasBI.pendientes}</h3>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Logros (Done)</p>
                    <h3 className="text-3xl font-black text-emerald-500">{metricasBI.completados}</h3>
                  </div>
                  <div className="bg-gradient-to-br from-[#FF4C4C] to-red-600 p-5 rounded-2xl shadow-sm text-white">
                    <p className="text-red-100 text-xs font-bold uppercase tracking-wider mb-1">Clima (Eval)</p>
                    <h3 className="text-4xl font-black flex items-center gap-2">{metricasBI.promEvals} <span className="text-lg">⭐</span></h3>
                  </div>
                </div>

                <MatrizNineBox empleados={dataParaMetricas} />

                {/* Graficos (BarChart y PieChart) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {esAdmin && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">📊 Performance Index por Área</h3>
                        <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-1 rounded font-medium">Mayor a Menor</span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={metricasBI.datosArea} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="promedio" radius={[6, 6, 0, 0]} barSize={35}>
                              {metricasBI.datosArea.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.promedio >= 80 ? '#10b981' : entry.promedio >= 60 ? '#3b82f6' : '#FF4C4C'} />))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-100 ${!esAdmin ? 'lg:col-span-3' : ''}`}>
                    <h3 className="font-bold text-slate-800 mb-2">🎯 Distribución Talentos</h3>
                    <p className="text-xs text-slate-500 mb-4">Mapeo de la organización según rendimiento general.</p>
                    <div className="h-56 flex justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={metricasBI.distribucion} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none" label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {metricasBI.distribucion.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ fontWeight: 'bold', color: '#333' }} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- CONTENIDO: MI PERFIL (Empleado sin equipo) --- */}
            {!esAdmin && vista === 'mi_perfil' && miDesempeno && (
              <div className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-sm border border-slate-100 border-t-4 border-t-[#FF4C4C] animate-in fade-in zoom-in-95 mt-4">
                <h2 className="text-3xl font-black text-slate-800 mb-2">Mi Rendimiento</h2>
                <div className="flex justify-between items-center mb-10 bg-[#FFF5F5] p-6 rounded-2xl border border-[#FFEAEA]">
                  <div><h3 className="text-6xl font-black text-[#FF4C4C]">{miDesempeno.cumplimiento_general}%</h3></div>
                  <div className="text-right"><p className="text-lg font-bold text-slate-800">{miDesempeno.nombre}</p><p className="text-slate-500 font-medium">{miDesempeno.puesto}</p></div>
                </div>
                <div className="space-y-5">
                  {miDesempeno.indicadores?.map(ind => (<div key={ind.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm"><div className="flex justify-between text-sm mb-2"><span className="font-semibold text-slate-700">{ind.titulo}</span><span className="font-black text-slate-800">{ind.progreso}%</span></div><div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#FF4C4C] to-red-600 rounded-full" style={{ width: `${ind.progreso}%` }}></div></div></div>))}
                </div>
              </div>
            )}
            {/* MODAL DE INVITACIONES INTELIGENTES */}
{modalInvitarAbierto && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 border border-slate-100">
      
     {/* Header del Modal */}
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Invitar Colaboradores</h2>
            <p className="text-xs text-slate-500 mt-1">Selecciona quiénes recibirán acceso a la plataforma.</p>
          </div>
          <button 
            onClick={() => setModalInvitarAbierto(false)}
            className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold hover:bg-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>
        
        {/* Nuevo control de Selección Masiva */}
        <button 
          onClick={toggleSeleccionarTodos}
          className="text-xs font-bold text-[#FF4C4C] hover:underline"
        >
          {empleadosSeleccionadosParaInvitar.length === empleados.filter(e => e.email !== perfil?.email).length 
            ? 'Deseleccionar todos' 
            : 'Seleccionar todos'
          }
        </button>
      </div>

      {/* Lista scrolleable de empleados */}
      <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
        <div className="space-y-3">
          {empleados.filter(e => e.email !== perfil?.email).map(emp => {
            const seleccionado = empleadosSeleccionadosParaInvitar.includes(emp.id);
            return (
              <label 
                key={emp.id} 
                className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all ${
                  seleccionado ? 'bg-red-50/50 border-[#FF4C4C]/40 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="shrink-0 ml-1">
                  <input 
                    type="checkbox" 
                    checked={seleccionado}
                    onChange={() => toggleSeleccionInvitacion(emp.id)}
                    className="w-4 h-4 rounded border-slate-300 text-[#FF4C4C] focus:ring-[#FF4C4C] accent-[#FF4C4C] cursor-pointer"
                  />
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                  {emp.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{emp.nombre}</p>
                  <p className="text-xs text-slate-500 truncate">{emp.email} • {emp.puesto}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Footer del Modal con botón de confirmación */}
      <div className="px-6 py-5 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
        <span className="text-sm font-bold text-slate-600">
          <span className="text-[#FF4C4C]">{empleadosSeleccionadosParaInvitar.length}</span> seleccionados
        </span>
        <div className="flex gap-3">
          <button 
            onClick={() => setModalInvitarAbierto(false)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={confirmarInvitacionMasiva}
            disabled={invitando || empleadosSeleccionadosParaInvitar.length === 0}
            className="bg-[#FF4C4C] text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {invitando ? 'Procesando...' : `Invitar (${empleadosSeleccionadosParaInvitar.length})`}
          </button>
        </div>
      </div>

    </div>
  </div>
)}

          </div>
        </main>
      </div>
    </div>
  )
}

// ==========================================
// COMPONENTES AUXILIARES
// ==========================================

// Botón Lateral del Menú
function BotonLateral({ icono, texto, activo, onClick, visible = true }: { icono: string, texto: string, activo: boolean, onClick: () => void, visible?: boolean }) {
  if (!visible) return null;
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        activo 
          ? 'bg-[#FFF0F0] text-[#FF4C4C] font-bold shadow-sm' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span className="text-lg w-6 text-center">{icono}</span>
      <span>{texto}</span>
    </button>
  );
}

// Vista de Evaluaciones (Se mantiene igual pero con clases más suaves)
function VistaEvaluaciones360({ miDesempeno, esLider, equipo, miLider, evaluaciones, onSave }: PropsVista360) {
  if (!miDesempeno) return null;
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 w-full">
      <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl text-sm text-indigo-900 shadow-sm flex items-center gap-3">
        <span className="text-2xl">🔄</span><p><strong>Evaluación 360°:</strong> Refleja tu desempeño y el de tu entorno para crecer juntos. Sé sincero y constructivo.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormEvaluacion evaluado={miDesempeno} tipo="autoevaluacion" titulo="Mi Autoevaluación" descripcion="¿Cómo evalúas tu propio desempeño este periodo?" miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="purple" />
        {miLider && (<FormEvaluacion evaluado={miLider} tipo="ascendente" titulo={`Evaluación a mi Líder: ${miLider.nombre}`} descripcion="Evalúa el apoyo y gestión de tu jefe directo." miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="blue" />)}
      </div>
      {esLider && equipo.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Evaluación de mi Equipo (Descendente)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {equipo.map((miembro) => (<FormEvaluacion key={miembro.id} evaluado={miembro} tipo="descendente" titulo={`Evaluar a ${miembro.nombre}`} descripcion={miembro.puesto} miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="emerald" />))}
          </div>
        </div>
      )}
    </div>
  )
}

function FormEvaluacion({ evaluado, tipo, titulo, descripcion, miId, evaluaciones, onSave, colorTheme }: PropsFormEval) {
  const yaEvaluado = evaluaciones.find((e) => e.evaluador_id === miId && e.evaluado_id === evaluado.id && e.tipo === tipo);
  const [puntuacion, setPuntuacion] = useState(0); const [feedback, setFeedback] = useState("");
  const bgMap: Record<string, string> = { purple: 'bg-purple-50 border-purple-100', blue: 'bg-blue-50 border-blue-100', emerald: 'bg-emerald-50 border-emerald-100' };
  const textMap: Record<string, string> = { purple: 'text-purple-800', blue: 'text-blue-800', emerald: 'text-emerald-800' };
  if (yaEvaluado) {
    return (<div className={`p-6 rounded-2xl border opacity-80 ${bgMap[colorTheme]}`}><h4 className={`font-bold mb-1 ${textMap[colorTheme]}`}>✅ {titulo} completada</h4><div className="text-2xl tracking-widest my-2">{'⭐'.repeat(yaEvaluado.puntuacion)}</div><p className="text-xs text-slate-600 italic">"{yaEvaluado.feedback}"</p></div>)
  }
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <h4 className="font-bold text-slate-800 mb-1">{titulo}</h4><p className="text-xs text-slate-500 mb-4">{descripcion}</p>
      <div className="mb-4"><p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Puntuación (1 a 5)</p><div className="flex gap-2">{[1, 2, 3, 4, 5].map(num => (<button key={num} onClick={() => setPuntuacion(num)} className={`w-8 h-8 rounded-full font-bold text-sm transition-colors ${puntuacion >= num ? 'bg-amber-400 text-white shadow-inner' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200'}`}>★</button>))}</div></div>
      <textarea className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 outline-none focus:border-slate-400 mb-3 resize-none h-20" placeholder="Escribe tu retroalimentación detallada y constructiva..." value={feedback} onChange={e => setFeedback(e.target.value)}></textarea>
      <button onClick={() => onSave(evaluado.id, tipo, puntuacion, feedback)} className={`w-full text-white font-bold py-2 rounded-lg text-sm transition-colors ${puntuacion > 0 && feedback ? 'bg-slate-800 hover:bg-slate-900' : 'bg-slate-300 cursor-not-allowed'}`}>Enviar Evaluación</button>
    </div>
  )
}

function construirArbol(areas: Area[], empleados: Empleado[]) { const areaMap = new Map(); areas.forEach(a => areaMap.set(a.id, { ...a, children: [], empleados: [] })); empleados.forEach(e => { if (e.area_id && areaMap.has(e.area_id)) areaMap.get(e.area_id).empleados.push(e); }); const raiz: Area[] = []; areaMap.forEach(area => { if (area.parent_id && areaMap.has(area.parent_id)) areaMap.get(area.parent_id).children.push(area); else raiz.push(area); }); return raiz; }
function NodoOrganigrama({ area }: { area: Area }) { return (<div className="flex flex-col items-center"><div className="relative flex flex-col w-56 bg-white rounded-xl shadow-md border border-slate-100 transition-transform hover:-translate-y-1 hover:shadow-xl z-10">{area.lider_id && (<div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1 border border-white whitespace-nowrap z-20">👑 Lider Asignado</div>)}<div className="bg-slate-800 text-white p-3 rounded-t-xl text-center border-b-4 border-[#FF4C4C]"><h3 className="font-bold text-sm tracking-wide truncate px-2" title={area.nombre}>{area.nombre}</h3></div><div className="p-2 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-slate-50 rounded-b-xl">{area.empleados && area.empleados.length > 0 ? (area.empleados.map(emp => (<div key={emp.id} className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-100 flex justify-between items-center shadow-sm hover:border-blue-200 transition-colors"><span className="truncate w-32 font-medium" title={emp.nombre}>{emp.nombre}</span><span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${emp.cumplimiento_general < 70 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{emp.cumplimiento_general}%</span></div>))) : (<div className="text-[10px] text-slate-400 text-center py-3 italic">Sin asignaciones</div>)}</div></div>{area.children && area.children.length > 0 && (<><div className="w-[2px] h-8 bg-slate-200"></div><div className="flex justify-center">{area.children.map((hijo, index) => { const isFirst = index === 0; const isLast = index === area.children!.length - 1; const isOnly = area.children!.length === 1; return (<div key={hijo.id} className="relative flex flex-col items-center pt-8 px-2 md:px-4">{!isOnly && (<div className={`absolute top-0 h-[2px] bg-slate-200 ${isFirst ? 'left-1/2 right-0' : ''} ${isLast ? 'left-0 right-1/2' : ''} ${!isFirst && !isLast ? 'left-0 right-0' : ''} `}></div>)}<div className="absolute top-0 w-[2px] h-8 bg-slate-200 left-1/2 -translate-x-1/2"></div><NodoOrganigrama area={hijo} /></div>) })}</div></>)}</div>) }
interface PropsTarjetaSaludArea {
  area: Area;
  empleadosArea: Empleado[];
  todosLosEmpleados: Empleado[];
  todasLasAreas: Area[];
  estaAbierta: boolean;
  onToggle: () => void;
  funcionesTarjeta: FuncionesTarjeta;
  asignarLiderArea: (aid: number, lid: string) => Promise<void>;
  asignarPadreArea: (aid: number, pid: string) => Promise<void>;
  calcularGantt: (creado: string, limite: string) => any;
}

function TarjetaSaludArea({
  area,
  empleadosArea,
  todosLosEmpleados,
  todasLasAreas,
  estaAbierta,
  onToggle,
  funcionesTarjeta,
  asignarLiderArea,
  asignarPadreArea,
  calcularGantt,
}: PropsTarjetaSaludArea) {
  const total = empleadosArea.length;
  const promedio = total > 0
    ? Math.round(empleadosArea.reduce((acc, curr) => acc + curr.cumplimiento_general, 0) / total)
    : 0;

  // Métricas estratégicas de RRHH
  const enRiesgo = empleadosArea.filter(e => e.cumplimiento_general < 60).length;
  const estandar = empleadosArea.filter(e => e.cumplimiento_general >= 60 && e.cumplimiento_general < 85).length;
  const topPerformers = empleadosArea.filter(e => e.cumplimiento_general >= 85).length;

  const todosLosPlanes = empleadosArea.flatMap(e => e.planes_mejora || []);
  const planesPendientes = todosLosPlanes.filter(p => p.estado !== 'completado').length;
  const planesVencidos = todosLosPlanes.filter(
    p => p.estado !== 'completado' && calcularGantt(p.created_at, p.fecha_limite).esVencido
  ).length;

  // Semáforo de Salud Organizacional
  let estadoSalud = { label: '🟢 Saludable', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (total === 0) {
    estadoSalud = { label: '⚪ Sin Equipo', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' };
  } else if (promedio < 60 || planesVencidos >= 3) {
    estadoSalud = { label: '🔴 Riesgo Crítico', badgeClass: 'bg-red-50 text-red-700 border-red-200' };
  } else if (promedio < 80 || planesVencidos > 0 || enRiesgo > 0) {
    estadoSalud = { label: '🟡 En Observación', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  }

  const liderActual = todosLosEmpleados.find(e => e.id === area.lider_id);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* 1. CABECERA EJECUTIVA DEL ÁREA */}
      <div className="p-5 md:p-6 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Identidad del Área & Líder */}
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{area.nombre}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estadoSalud.badgeClass}`}>
                {estadoSalud.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span>👑 Líder: <strong className="text-slate-700">{liderActual ? liderActual.nombre : 'Sin asignar'}</strong></span>
              <span>•</span>
              <span>👥 Headcount: <strong className="text-slate-700">{total} colaboradores</strong></span>
            </p>
          </div>

          {/* Score Promedio y Barra de Rendimiento */}
          <div className="flex items-center gap-5 shrink-0 bg-slate-50/70 p-3 px-4 rounded-xl border border-slate-100">
            <div className="w-36">
              <div className="flex justify-between items-center text-[11px] font-bold mb-1">
                <span className="text-slate-500 uppercase tracking-wider">Cumplimiento</span>
                <span className={promedio >= 80 ? 'text-emerald-600' : promedio >= 60 ? 'text-blue-600' : 'text-[#FF4C4C]'}>
                  {promedio}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    promedio >= 80 ? 'bg-emerald-500' : promedio >= 60 ? 'bg-blue-500' : 'bg-[#FF4C4C]'
                  }`}
                  style={{ width: `${promedio}%` }}
                />
              </div>
            </div>

            <div className="text-right pl-3 border-l border-slate-200">
              <span className="text-2xl font-black text-slate-800">{promedio}%</span>
              <span className="block text-[9px] uppercase font-bold text-slate-400">Promedio</span>
            </div>
          </div>
        </div>

        {/* 2. FRANJA ESTRATÉGICA (DISPERSIÓN Y COMPROMISOS) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 text-xs">
          
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Top Talent (≥85%)</span>
            <span className="text-sm font-black text-emerald-600">{topPerformers}</span>
            <span className="text-[10px] text-slate-400 ml-1">colaboradores</span>
          </div>

          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Estándar (60-84%)</span>
            <span className="text-sm font-black text-slate-700">{estandar}</span>
            <span className="text-[10px] text-slate-400 ml-1">colaboradores</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${enRiesgo > 0 ? 'bg-red-50/80 border-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">En Riesgo (&lt;60%)</span>
            <span className={`text-sm font-black ${enRiesgo > 0 ? 'text-[#FF4C4C]' : 'text-slate-700'}`}>{enRiesgo}</span>
            <span className="text-[10px] text-slate-400 ml-1">en alerta</span>
          </div>

          <div className={`p-2.5 rounded-xl border ${planesVencidos > 0 ? 'bg-red-50/80 border-red-100' : 'bg-slate-50/80 border-slate-100'}`}>
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Compromisos</span>
            <span className="text-sm font-black text-slate-800">{planesPendientes}</span>
            <span className="text-[10px] text-slate-400 ml-1">
              {planesVencidos > 0 ? `(${planesVencidos} vencidos ⚠️)` : 'activos'}
            </span>
          </div>

        </div>

        {/* 3. CONFIGURACIÓN RÁPIDA (LÍDER & REPORTE) + BOTÓN EXPANDIR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Líder:</span>
              <select
                className="bg-slate-50 border border-slate-200 rounded-lg text-xs py-1 px-2 text-slate-700 outline-none focus:border-slate-400"
                value={area.lider_id || ""}
                onChange={(e) => asignarLiderArea(area.id, e.target.value)}
              >
                <option value="">-- Sin Asignar --</option>
                {todosLosEmpleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Depende de:</span>
              <select
                className="bg-slate-50 border border-slate-200 rounded-lg text-xs py-1 px-2 text-slate-700 outline-none focus:border-slate-400"
                value={area.parent_id || ""}
                onChange={(e) => asignarPadreArea(area.id, e.target.value)}
              >
                <option value="">(Principal)</option>
                {todasLasAreas.filter(a => a.id !== area.id).map(a => (<option key={a.id} value={a.id}>{a.nombre}</option>))}
              </select>
            </div>
          </div>

          <button
            onClick={onToggle}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              estaAbierta
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>{estaAbierta ? 'Ocultar Colaboradores' : `Ver ${total} Colaboradores`}</span>
            <span className="text-[10px]">{estaAbierta ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* 4. LISTA DE COLABORADORES (SOLO VISIBLE SI SE EXPANDE) */}
      {estaAbierta && (
        <div className="p-5 md:p-6 bg-slate-50/50 border-t border-slate-200/80 animate-in slide-in-from-top-2">
          {empleadosArea.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {empleadosArea.map(emp => (
                <TarjetaEmpleado
                  key={emp.id}
                  emp={emp}
                  esLider={area.lider_id === emp.id}
                  areas={todasLasAreas}
                  allowEdit={true}
                  funciones={funcionesTarjeta}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 italic py-6">
              No hay colaboradores asignados a esta área todavía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function TarjetaEmpleado({ emp, esLider, areas, allowEdit, funciones }: PropsTarjeta) {
  const {
    asignarAreaEmpleado, actualizarIndicador, actualizarPotencial, agregarIndicador,
    crearPlan, completarPlan, setExpandidoId, expandidoId, nuevosIndicadores,
    setNuevosIndicadores, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes,
    calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario,
    nuevosComentarios, setNuevosComentarios
  } = funciones;

  const estaExpandido = expandidoId === emp.id;
  const planesActivos = emp.planes_mejora?.filter(p => p.estado !== 'completado') || [];
  const planesVencidos = planesActivos.filter(p => calcularGantt(p.created_at, p.fecha_limite).esVencido);
  const colorDesempeno = emp.cumplimiento_general >= 85 ? 'text-emerald-600' : emp.cumplimiento_general >= 70 ? 'text-blue-600' : 'text-[#FF4C4C]';
  const barBg = emp.cumplimiento_general >= 85 ? 'bg-emerald-500' : emp.cumplimiento_general >= 70 ? 'bg-blue-600' : 'bg-[#FF4C4C]';

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-lg ${
      esLider ? 'border-amber-200/80 shadow-amber-50/50' : 'border-slate-100'
    } shadow-sm overflow-hidden flex flex-col justify-between`}>
      
      {/* 1. VISTA ESTRATÉGICA (SIEMPRE VISIBLE) */}
      <div className="p-5">
        
        {/* Cabecera: Avatar, Nombre, Rol y Score */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
              esLider ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
            }`}>
              {emp.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base truncate" title={emp.nombre}>
                  {emp.nombre}
                </h3>
                {esLider && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200/60 font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                    Líder
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate font-medium">{emp.puesto}</p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className={`text-2xl font-black tracking-tight leading-none ${colorDesempeno}`}>
              {emp.cumplimiento_general}%
            </span>
            <span className="block text-[9px] uppercase font-bold text-slate-400 mt-0.5">Score</span>
          </div>
        </div>

        {/* Barra de Progreso Minimalista */}
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all duration-700 ${barBg}`} style={{ width: `${emp.cumplimiento_general}%` }}></div>
        </div>

        {/* Chips de Diagnóstico Rápido */}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          {/* Potencial Nine-Box en Badge Discreto */}
          {allowEdit ? (
            <div className="relative inline-block">
              <select
                value={emp.potencial_score || 1}
                onChange={(e) => actualizarPotencial(emp.id, parseInt(e.target.value))}
                className="bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] font-semibold text-slate-700 py-1 px-2 pr-6 outline-none focus:border-slate-400 cursor-pointer appearance-none transition-colors"
              >
                <option value="1">🌱 Potencial Bajo</option>
                <option value="2">🚀 Potencial Medio</option>
                <option value="3">⭐ Potencial Alto</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">▼</span>
            </div>
          ) : (
            <span className="bg-slate-50 text-slate-600 border border-slate-200/60 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
              {emp.potencial_score === 3 ? '⭐ Alto Potencial' : emp.potencial_score === 2 ? '🚀 Medio' : '🌱 Bajo'}
            </span>
          )}

          {/* Estado de Acciones */}
          <div className="flex items-center gap-1.5">
            {planesVencidos.length > 0 ? (
              <span className="text-[11px] bg-red-50 text-red-600 border border-red-100 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                <span>⚠️</span> {planesVencidos.length} Vencido{planesVencidos.length > 1 ? 's' : ''}
              </span>
            ) : planesActivos.length > 0 ? (
              <span className="text-[11px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-lg">
                🚀 {planesActivos.length} Plan{planesActivos.length > 1 ? 'es' : ''}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">
                Sin alertas
              </span>
            )}

            <span className="text-[11px] bg-slate-50 text-slate-500 font-medium px-2 py-0.5 rounded-lg border border-slate-100">
              📊 {emp.indicadores?.length || 0} KPIs
            </span>
          </div>
        </div>

      </div>

      {/* 2. BOTÓN DE APERTURA OPERATIVA */}
      <div className="border-t border-slate-100 bg-slate-50/50">
        <button
          onClick={() => setExpandidoId(estaExpandido ? null : emp.id)}
          className={`w-full py-2.5 text-center text-[11px] font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 ${
            estaExpandido
              ? 'text-slate-600 bg-slate-100'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
          }`}
        >
          <span>{estaExpandido ? 'Cerrar detalle' : 'Gestionar KPIs y Planes'}</span>
          <span className="text-[9px]">{estaExpandido ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* 3. VISTA OPERATIVA DETALLADA (SOLO AL DESPLEGAR) */}
      {estaExpandido && (
        <div className="border-t border-slate-200/80 bg-slate-50/70 p-5 space-y-5 animate-in slide-in-from-top-2">
          
          {/* Reasignar Área */}
          {allowEdit && (
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mover de Área</label>
              <select
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-slate-400 shadow-sm"
                value={emp.area_id || ""}
                onChange={(e) => asignarAreaEmpleado(emp.id, e.target.value)}
              >
                <option value="">-- Sin Área Asignada --</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          )}

          {/* Sección de Indicadores (KPIs) */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Indicadores Clave</span>
              <span className="text-[10px] text-slate-400 font-bold">{emp.indicadores?.length || 0} activos</span>
            </div>

            <div className="space-y-3 mb-3">
              {emp.indicadores?.map((ind) => (
                <div key={ind.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                  
                  {/* BOTÓN DE ELIMINAR (SIEMPRE VISIBLE EN ROJO SUAVE) */}
                  {allowEdit && (
                    <button 
                      onClick={() => funciones.eliminarIndicador(ind.id)}
                      className="absolute top-2 right-2 text-red-300 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors text-xs font-bold"
                      title="Eliminar KPI"
                    >
                      🗑️ Borrar
                    </button>
                  )}

                  <div className="pr-16">
                    <div className="flex justify-between items-center mb-1 font-semibold text-slate-700">
                      <span className="truncate text-sm">{ind.titulo}</span>
                      <span className={`text-lg ml-2 ${ind.progreso < 70 ? 'text-[#FF4C4C] font-black' : 'text-slate-800 font-black'}`}>
                        {ind.progreso || 0}%
                      </span>
                    </div>
                    {ind.descripcion && <p className="text-[11px] text-slate-500 mb-3 leading-tight border-b border-slate-100 pb-2">{ind.descripcion}</p>}
                  </div>
                  
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Meta a lograr:</span>
                      <span className="text-sm font-bold text-slate-800">{ind.meta_esperada || 0} <span className="text-xs font-normal text-slate-500">{ind.unidad_medida || 'Und.'}</span></span>
                    </div>
                    
                    <div className="w-px h-8 bg-slate-200 mx-2"></div>
                    
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Resultado actual:</span>
                      {allowEdit ? (
                        <div className="flex items-center gap-2">
                           <input
                              type="number"
                              className="w-20 p-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#FF4C4C] outline-none text-slate-800 font-bold"
                              value={ind.resultado_actual === 0 ? '' : ind.resultado_actual}
                              placeholder="0"
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                actualizarIndicador(ind.id, isNaN(val) ? 0 : val, emp.id);
                              }}
/>
                           <span className="text-xs text-slate-500">{ind.unidad_medida}</span>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-slate-800">{ind.resultado_actual || 0} <span className="text-xs font-normal text-slate-500">{ind.unidad_medida}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Barra visual de cumplimiento */}
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden mt-3 w-full">
                     <div className={`h-full rounded-full ${ind.progreso >= 100 ? 'bg-emerald-500' : ind.progreso >= 70 ? 'bg-blue-500' : 'bg-[#FF4C4C]'}`} style={{ width: `${ind.progreso || 0}%` }}></div>
                  </div>
                </div>
              ))}
            </div>

            {allowEdit && (
              <FormularioNuevoKPI empId={emp.id} onAdd={agregarIndicador} />
            )}
          </div>

          {/* Sección de Action Plans */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">Planes de Mejora</span>
            
            {emp.planes_mejora && emp.planes_mejora.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {emp.planes_mejora.map((plan) => {
                  const gantt = calcularGantt(plan.created_at, plan.fecha_limite);
                  return (
                    <div key={plan.id} className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className={`text-xs font-semibold truncate w-[60%] ${plan.estado === 'completado' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {plan.compromiso}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setPlanChatAbierto(planChatAbierto === plan.id ? null : plan.id)}
                            className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            💬 {plan.comentarios?.length || 0}
                          </button>
                          {allowEdit && (
                            <button
                              onClick={() => completarPlan(plan.id, plan.estado)}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                                plan.estado === 'completado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                            >
                              {plan.estado === 'completado' ? 'Listo' : 'OK'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                        <span>Inicio: {gantt.fechaInicioStr}</span>
                        <span className={gantt.esVencido && plan.estado !== 'completado' ? 'text-red-500 font-bold' : ''}>
                          {plan.estado === 'completado' ? 'Completado' : (gantt.esVencido ? 'Vencido' : `Meta: ${gantt.fechaFinStr}`)}
                        </span>
                      </div>

                      {/* Chat de comentarios */}
                      {planChatAbierto === plan.id && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100">
                          <div className="max-h-24 overflow-y-auto space-y-1.5 mb-2 custom-scrollbar">
                            {plan.comentarios?.map(c => (
                              <div key={c.id} className="text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                                <strong className="text-slate-700">{c.autor}: </strong>
                                <span className="text-slate-600">{c.texto}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              className="flex-1 text-[10px] border border-slate-200 rounded p-1.5 outline-none"
                              placeholder="Comentario..."
                              value={nuevosComentarios[plan.id] || ''}
                              onChange={e => setNuevosComentarios({ ...nuevosComentarios, [plan.id]: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') enviarComentario(plan.id); }}
                            />
                            <button
                              onClick={() => enviarComentario(plan.id)}
                              className="bg-slate-800 text-white px-2.5 rounded text-[10px] font-bold"
                            >
                              Enviar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-2">Sin compromisos asignados.</p>
            )}

            {/* Asignar nuevo compromiso */}
            {allowEdit && (
              <div className="mt-3 flex gap-1.5">
                <input
                  className="flex-1 text-xs border border-slate-200 bg-white p-2 rounded-lg outline-none focus:border-slate-400"
                  placeholder="Asignar compromiso..."
                  value={textosPlanes[emp.id] || ''}
                  onChange={e => setTextosPlanes({ ...textosPlanes, [emp.id]: e.target.value })}
                />
                <select
                  className="text-xs border border-slate-200 bg-white text-slate-700 rounded-lg px-2 outline-none"
                  value={diasPlanes[emp.id] || 7}
                  onChange={e => setDiasPlanes({ ...diasPlanes, [emp.id]: parseInt(e.target.value) })}
                >
                  <option value={3}>3d</option>
                  <option value={7}>7d</option>
                  <option value={15}>15d</option>
                </select>
                <button
                  onClick={() => crearPlan(emp.id)}
                  className="bg-slate-800 text-white px-3 rounded-lg font-bold hover:bg-slate-900 transition-colors"
                >
                  +
                </button>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

function MatrizNineBox({ empleados }: { empleados: Empleado[] }) {
  const cuadrantes = [
    { id: '3-1', titulo: 'Enigma', desc: 'Alto Potencial / Bajo Desempeño', color: 'bg-orange-50 border-orange-200' },
    { id: '3-2', titulo: 'Futura Estrella', desc: 'Alto Potencial / Medio Desempeño', color: 'bg-blue-50 border-blue-200' },
    { id: '3-3', titulo: 'Estrella', desc: 'Alto Potencial / Alto Desempeño', color: 'bg-green-100 border-green-300 shadow-inner' },
    { id: '2-1', titulo: 'Dilema', desc: 'Medio Potencial / Bajo Desempeño', color: 'bg-red-50 border-red-200' },
    { id: '2-2', titulo: 'Jugador Clave', desc: 'Medio Potencial / Medio Desempeño', color: 'bg-slate-50 border-slate-200' },
    { id: '2-3', titulo: 'Alto Impacto', desc: 'Medio Potencial / Alto Desempeño', color: 'bg-blue-50 border-blue-200' },
    { id: '1-1', titulo: 'Riesgo', desc: 'Bajo Potencial / Bajo Desempeño', color: 'bg-[#FFF0F0] border-[#FF4C4C]/30 shadow-inner' },
    { id: '1-2', titulo: 'Efectivo', desc: 'Bajo Potencial / Medio Desempeño', color: 'bg-orange-50 border-orange-200' },
    { id: '1-3', titulo: 'Especialista', desc: 'Bajo Potencial / Alto Desempeño', color: 'bg-slate-50 border-slate-200' },
  ];

  const obtenerNivelDesempeño = (score: number) => {
    if (score < 60) return 1;
    if (score < 85) return 2;
    return 3;
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 mt-6">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Matriz de Talento (Nine-Box)</h2>
      <p className="text-xs text-slate-500 mb-6">Clasificación automática basada en el cumplimiento de KPIs y potencial evaluado.</p>
      <div className="relative pl-8 pb-8">
        <div className="absolute left-0 top-0 bottom-8 w-8 flex flex-col justify-center items-center">
          <span className="transform -rotate-90 text-[10px] font-bold text-slate-400 tracking-widest uppercase whitespace-nowrap">Potencial (Crecimiento) ➔</span>
        </div>
        <div className="grid grid-cols-3 grid-rows-3 gap-2 h-[500px]">
          {cuadrantes.map((c) => {
            const [potencialReq, desempeñoReq] = c.id.split('-').map(Number);
            const empleadosAqui = empleados.filter(emp => {
              const pot = emp.potencial_score || 1;
              const des = obtenerNivelDesempeño(emp.cumplimiento_general || 0);
              return pot === potencialReq && des === desempeñoReq;
            });
            return (
              <div key={c.id} className={`p-3 rounded-xl border flex flex-col ${c.color} transition-all`}>
                <div className="mb-2 border-b border-black/5 pb-2">
                  <h3 className="font-bold text-slate-700 text-xs">{c.titulo}</h3>
                  <p className="text-[8px] text-slate-500 uppercase font-semibold">{c.desc}</p>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                  {empleadosAqui.map(emp => (
                    <div key={emp.id} className="bg-white p-2 rounded-lg text-xs border border-slate-100 font-medium text-slate-700 shadow-sm flex justify-between items-center">
                      <span className="truncate pr-2">{emp.nombre}</span>
                      <span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-600 font-bold">{emp.cumplimiento_general}%</span>
                    </div>
                  ))}
                  {empleadosAqui.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-40">
                      <span className="text-[10px] font-medium text-slate-400">Vacío</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute bottom-0 left-8 right-0 h-8 flex justify-center items-center">
          <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Desempeño (Score KPIs) ➔</span>
        </div>
      </div>
    </div>
  );
}
function FormularioNuevoKPI({ empId, onAdd }: { empId: number, onAdd: (eid: number, data: any) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidad, setUnidad] = useState('Cantidad');
  const [meta, setMeta] = useState('');
  const [direccion, setDireccion] = useState<'creciente' | 'decreciente'>('creciente'); // NUEVO ESTADO

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo || !meta) return alert("El título y la meta son obligatorios");
    
    onAdd(empId, {
      titulo,
      descripcion,
      unidad_medida: unidad,
      meta_esperada: parseFloat(meta) || 0,
      direccion // NUEVO DATO QUE SE ENVÍA
    });
    
    setTitulo(''); setDescripcion(''); setMeta(''); setDireccion('creciente'); setAbierto(false);
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="w-full py-2 mt-2 border-2 border-dashed border-slate-200 text-slate-400 text-xs font-bold rounded-xl hover:border-slate-300 hover:text-slate-500 transition-colors">
        + Agregar Nuevo KPI
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-100 p-3 rounded-xl border border-slate-200 space-y-2 mt-2">
      <input autoFocus placeholder="Título del KPI (Ej: Tiempo de contratación)" className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white" value={titulo} onChange={e => setTitulo(e.target.value)} required />
      <textarea placeholder="Descripción o contexto del indicador..." className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white resize-none h-12" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
      
      {/* NUEVO SELECTOR DE SENTIDO DEL KPI */}
      <div>
        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase">¿Cómo se mide el éxito?</label>
        <select className="w-full text-xs p-2 rounded outline-none border border-slate-200 bg-white text-slate-700 font-medium" value={direccion} onChange={e => setDireccion(e.target.value as 'creciente' | 'decreciente')}>
          <option value="creciente">📈 Normal (Más es mejor: Ventas, PQRs resueltas)</option>
          <option value="decreciente">📉 Inverso (Menos es mejor: Tiempos, Costos, Rotación)</option>
        </select>
      </div>

      <div className="flex gap-2">
        <select className="flex-1 text-xs p-2 rounded outline-none border border-slate-200 bg-white text-slate-600" value={unidad} onChange={e => setUnidad(e.target.value)}>
          <option value="Cantidad">Cantidad (#)</option>
          <option value="%">% (Porcentaje)</option>
          <option value="$">$ (Moneda)</option>
          <option value="Días">Días</option>
        </select>
        <input type="number" placeholder="Meta esperada" className="flex-1 text-xs p-2 rounded outline-none border border-slate-200 bg-white" value={meta} onChange={e => setMeta(e.target.value)} required />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setAbierto(false)} className="flex-1 text-[10px] font-bold text-slate-500 hover:bg-slate-200 py-1.5 rounded transition">Cancelar</button>
        <button type="submit" className="flex-1 text-[10px] font-bold text-white bg-slate-800 hover:bg-slate-900 py-1.5 rounded transition">Guardar KPI</button>
      </div>
    </form>
  );
}