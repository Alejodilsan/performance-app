'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- TIPOS DE DATOS ---
interface Area { id: number; nombre: string; lider_id: number | null; parent_id: number | null; children?: Area[]; empleados?: Empleado[]; }
interface Indicador { id: number; titulo: string; progreso: number; }
interface Comentario { id: number; autor: string; texto: string; created_at: string; }
interface Plan { id: number; compromiso: string; estado: string; fecha_limite: string; created_at: string; comentarios?: Comentario[]; }
interface Evaluacion { id: number; evaluador_id: number; evaluado_id: number; tipo: string; puntuacion: number; feedback: string; created_at: string; }
interface Empleado { id: number; nombre: string; puesto: string; email: string; cumplimiento_general: number; area_id: number | null; indicadores?: Indicador[]; planes_mejora?: Plan[]; }

export default function DashboardPerformance() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const [esLider, setEsLider] = useState(false)
  const [areaLiderada, setAreaLiderada] = useState<Area | null>(null)
  const [equipoLiderado, setEquipoLiderado] = useState<Empleado[]>([])
  const [vista, setVista] = useState<'tablero' | 'organigrama' | 'informes' | 'mi_equipo' | 'mi_perfil' | 'evaluaciones'>('tablero')

  const [nombre, setNombre] = useState(''); const [puesto, setPuesto] = useState(''); const [emailEmpleado, setEmailEmpleado] = useState('');
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState(''); const [nuevaAreaPadre, setNuevaAreaPadre] = useState<string>("");
  const [expandidoId, setExpandidoId] = useState<number | null>(null); const [nuevoIndicador, setNuevoIndicador] = useState('');
  const [textosPlanes, setTextosPlanes] = useState<{ [key: number]: string }>({}); const [diasPlanes, setDiasPlanes] = useState<{ [key: number]: number }>({});
  const [planChatAbierto, setPlanChatAbierto] = useState<number | null>(null); const [nuevoComentario, setNuevoComentario] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

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
    if (perfilData?.rol === 'admin') { obtenerDatosCorporativos(); } else { await identificarRolEmpleado(session.user.email!); }
    setLoading(false)
  }

  async function obtenerDatosCorporativos() {
    const { data: areasData } = await supabase.from('areas').select('*').order('id');
    const { data: empData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').order('id', { ascending: true })
    const { data: evalData } = await supabase.from('evaluaciones').select('*');
    if (areasData) setAreas(areasData); if (evalData) setEvaluaciones(evalData);
    if (empData) {
       const dataOrdenada = empData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) }))
       setEmpleados(dataOrdenada)
       const miFicha = dataOrdenada.find((e:any) => e.email === perfil?.email); if (miFicha) setMiDesempeno(miFicha);
    }
  }

  async function identificarRolEmpleado(email: string) {
    const { data: areasData } = await supabase.from('areas').select('*').order('id');
    const { data: evalData } = await supabase.from('evaluaciones').select('*');
    if (areasData) setAreas(areasData); if (evalData) setEvaluaciones(evalData);
    const { data: miData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').eq('email', email).single()
    if (miData) {
       setMiDesempeno({ ...miData, planes_mejora: miData.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) });
       const { data: areaLider } = await supabase.from('areas').select('*').eq('lider_id', miData.id).single();
       if (areaLider) {
         setEsLider(true); setAreaLiderada(areaLider); setVista('mi_equipo'); 
         const { data: equipoData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').eq('area_id', areaLider.id).order('id');
         if (equipoData) setEquipoLiderado(equipoData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) })));
       } else { setVista('mi_perfil'); }
    }
  }

  const recargarDatos = () => { if (perfil?.rol === 'admin') obtenerDatosCorporativos(); else if (perfil?.email) identificarRolEmpleado(perfil.email); }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' }); const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[]; 
      let areasActivas = [...areas];
      for (const row of data) {
        const emailRow = row['Email'] || row['email'];
        if (emailRow) {
           let parentId = null; let areaId = null; const reportaARow = row['Reporta A'] || row['Reporta a']; const areaRow = row['Area'] || row['area'];
           if (reportaARow) {
              let padreExist = areasActivas.find(a => a.nombre.toLowerCase() === String(reportaARow).toLowerCase());
              if (padreExist) parentId = padreExist.id;
              else { const { data: nP } = await supabase.from('areas').insert([{ nombre: reportaARow }]).select().single(); if (nP) { parentId = nP.id; areasActivas.push(nP); } }
           }
           if (areaRow) {
             let aExist = areasActivas.find(a => a.nombre.toLowerCase() === String(areaRow).toLowerCase());
             if (aExist) { areaId = aExist.id; if (parentId && !aExist.parent_id) { await supabase.from('areas').update({ parent_id: parentId }).eq('id', areaId); aExist.parent_id = parentId; } } 
             else { const { data: nA } = await supabase.from('areas').insert([{ nombre: areaRow, parent_id: parentId }]).select().single(); if (nA) { areaId = nA.id; areasActivas.push(nA); } }
           }
           await supabase.from('empleados').insert([{ nombre: row['Nombre']||'X', email: emailRow, puesto: row['Puesto']||'Emp', area_id: areaId, cumplimiento_general: 0 }]);
        }
      }
      alert("Carga completada sin duplicados y con jerarquía armada. 🚀"); window.location.reload(); 
    }; reader.readAsBinaryString(file);
  };
  
  async function crearArea(){ if(!nuevaAreaNombre)return; await supabase.from('areas').insert([{nombre:nuevaAreaNombre, parent_id:nuevaAreaPadre?parseInt(nuevaAreaPadre):null}]); setNuevaAreaNombre(''); setNuevaAreaPadre(""); recargarDatos();}
  async function asignarPadreArea(aid:number, pid:string){ const npid=pid===""?null:parseInt(pid); if(npid===aid)return; await supabase.from('areas').update({parent_id:npid}).eq('id',aid); recargarDatos();}
  async function asignarLiderArea(aid:number, lid:string){ await supabase.from('areas').update({lider_id:lid===""?null:parseInt(lid)}).eq('id',aid); recargarDatos();}
  async function asignarAreaEmpleado(eid:number, aid:string){ await supabase.from('empleados').update({area_id:aid===""?null:parseInt(aid)}).eq('id',eid); recargarDatos();}
  async function agregarEmpleado(e:React.FormEvent){ e.preventDefault(); await supabase.from('empleados').insert([{nombre,puesto,email:emailEmpleado,cumplimiento_general:0}]); setNombre('');setPuesto('');setEmailEmpleado(''); recargarDatos();}
  async function agregarIndicador(eid:number){ if(!nuevoIndicador)return; await supabase.from('indicadores').insert([{empleado_id:eid, titulo:nuevoIndicador,progreso:0}]); setNuevoIndicador(''); recargarDatos();}
  
  // CORRECCIÓN: Actualización en tiempo real del promedio de KPIs
  async function actualizarIndicador(id:number, val:number, eid:number){ 
      const targetList = perfil?.rol === 'admin' ? empleados : equipoLiderado; 
      const setter = perfil?.rol === 'admin' ? setEmpleados : setEquipoLiderado;
      
      const updatedList = targetList.map(emp => {
          if (emp.id === eid) {
             const nuevosIndicadores = emp.indicadores?.map(i => i.id === id ? { ...i, progreso: val } : i) || [];
             const suma = nuevosIndicadores.reduce((acc, curr) => acc + curr.progreso, 0);
             const nuevoPromedio = nuevosIndicadores.length > 0 ? Math.round(suma / nuevosIndicadores.length) : 0;
             
             return { ...emp, indicadores: nuevosIndicadores, cumplimiento_general: nuevoPromedio };
          }
          return emp;
      });

      setter(updatedList);
      await supabase.from('indicadores').update({progreso:val}).eq('id',id);
  }

  async function crearPlan(eid:number){ const txt=textosPlanes[eid]; if(!txt)return; const lim=new Date(); lim.setDate(lim.getDate()+(diasPlanes[eid]||7)); await supabase.from('planes_mejora').insert([{empleado_id:eid, compromiso:txt, created_at:new Date().toISOString(), fecha_limite:lim.toISOString(), estado:'pendiente'}]); setTextosPlanes({...textosPlanes,[eid]:''}); recargarDatos();}
  async function completarPlan(pid:number, est:string){ await supabase.from('planes_mejora').update({estado:est==='pendiente'?'completado':'pendiente'}).eq('id',pid); recargarDatos();}
  async function enviarComentario(pid:number){ if(!nuevoComentario)return; await supabase.from('comentarios').insert([{plan_id:pid, autor:perfil.nombre, texto:nuevoComentario}]); setNuevoComentario(''); recargarDatos();}
  async function guardarEvaluacion(evaluadoId: number, tipo: string, puntuacion: number, feedback: string) {
      if (!miDesempeno) return; if (puntuacion === 0) return alert("Selecciona una puntuación"); if (feedback.trim() === '') return alert("Escribe un comentario");
      await supabase.from('evaluaciones').insert([{ evaluador_id: miDesempeno.id, evaluado_id: evaluadoId, tipo, puntuacion, feedback }]);
      alert("Evaluación enviada"); recargarDatos();
  }

  // ==========================================
  // --- MOTOR DE BUSINESS INTELLIGENCE (BI) ---
  // ==========================================
  const esAdmin = perfil?.rol === 'admin';
  const dataParaMetricas = esAdmin ? empleados : equipoLiderado;
  
  const metricasBI = useMemo(() => {
    const total = dataParaMetricas.length;
    const prom = total > 0 ? Math.round(dataParaMetricas.reduce((a,b)=>a+b.cumplimiento_general,0)/total) : 0;
    
    // 1. Distribución 9-Box
    const bajo = dataParaMetricas.filter(e=>e.cumplimiento_general<60).length;
    const medio = dataParaMetricas.filter(e=>e.cumplimiento_general>=60 && e.cumplimiento_general<85).length;
    const alto = dataParaMetricas.filter(e=>e.cumplimiento_general>=85).length;
    const distribucion = [{name:'Riesgo (<60%)',value:bajo,color:'#EF4444'},{name:'Estándar (60-85%)',value:medio,color:'#F59E0B'},{name:'Alto (>85%)',value:alto,color:'#10B981'}].filter(d=>d.value>0);

    // 2. Planes de Acción
    const todosPlanes = dataParaMetricas.flatMap(e=>e.planes_mejora||[]);
    const pendientes = todosPlanes.filter(p=>p.estado==='pendiente').length;
    const completados = todosPlanes.filter(p=>p.estado==='completado').length;

    // 3. Top Talent & Riesgo Fuga
    const ranking = [...dataParaMetricas].sort((a,b) => b.cumplimiento_general - a.cumplimiento_general);
    const top5 = ranking.slice(0, 5);
    const bottom5 = [...ranking].reverse().slice(0, 5).filter(e => e.cumplimiento_general < 70);

    // 4. Analítica de Áreas (Solo Admin)
    const datosArea = areas.map(area => {
        const miembros = empleados.filter(e => e.area_id === area.id);
        const promArea = miembros.length > 0 ? Math.round(miembros.reduce((acc, curr) => acc + curr.cumplimiento_general, 0) / miembros.length) : 0;
        return { name: area.nombre, promedio: promArea, cantidad: miembros.length, lider: area.lider_id ? empleados.find(e=>e.id===area.lider_id)?.nombre : 'Sin Asignar' };
    }).filter(d => d.cantidad > 0).sort((a,b) => b.promedio - a.promedio);

    // 5. Analítica de Evaluaciones 360
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

  if (loading) return <div className="p-10 text-center text-slate-500 font-medium">Iniciando Plataforma Corporativa...</div>

  // ==========================================
  // VISTA 1: COLABORADOR INDIVIDUAL
  // ==========================================
  if (perfil?.rol !== 'admin' && !esLider) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Hola, {perfil?.nombre} 👋</h1>
                <div className="flex gap-4">
                    <BtnMenu active={vista==='mi_perfil'} onClick={()=>setVista('mi_perfil')}>Mi Rendimiento</BtnMenu>
                    <BtnMenu active={vista==='evaluaciones'} onClick={()=>setVista('evaluaciones')}>Evaluaciones 360</BtnMenu>
                    <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-red-500 text-sm font-medium hover:underline ml-4">Salir</button>
                </div>
            </div>
             {vista === 'mi_perfil' && miDesempeno && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-blue-600">
                        <div className="flex justify-between items-end mb-4">
                            <div><h3 className="text-4xl font-bold text-blue-600">{miDesempeno.cumplimiento_general}%</h3><p className="text-slate-500 font-medium">Rendimiento General</p></div>
                            <div className="text-right text-sm text-slate-400"><p>{miDesempeno.puesto}</p><p>{miDesempeno.email}</p></div>
                        </div>
                        <div className="space-y-3">{miDesempeno.indicadores?.map(ind => (<div key={ind.id}><div className="flex justify-between text-sm mb-1 text-slate-600"><span>{ind.titulo}</span><span className="font-bold">{ind.progreso}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width:`${ind.progreso}%`}}></div></div></div>))}</div>
                    </div>
                    {/* ZONA PLANES DE MEJORA INDIVIDUALES */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">📈 Evolución y Compromisos</h3>
                        {miDesempeno.planes_mejora && miDesempeno.planes_mejora.length > 0 ? (
                            <div className="space-y-4">
                                {miDesempeno.planes_mejora.map(plan => {
                                    const gantt = calcularGantt(plan.created_at, plan.fecha_limite);
                                    return (
                                        <div key={plan.id} className={`p-4 rounded-lg border-l-4 ${plan.estado === 'completado' ? 'bg-green-50 border-green-500' : 'bg-white border-blue-500 shadow-sm'}`}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-medium text-sm text-slate-800">{plan.compromiso}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${plan.estado==='completado'?'bg-green-200 text-green-800':'bg-blue-100 text-blue-800'}`}>{plan.estado}</span>
                                            </div>
                                            <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className={`absolute top-0 left-0 h-full ${gantt.esVencido?'bg-red-400':'bg-blue-400'}`} style={{width:`${gantt.porcentajeAvance}%`}}></div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
                                                <span>Inicio: {gantt.fechaInicioStr}</span>
                                                <span className={gantt.esVencido?'text-red-500 font-bold':''}>{gantt.esVencido ? 'Vencido' : `Meta: ${gantt.fechaFinStr}`}</span>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-100">
                                                <button onClick={() => setPlanChatAbierto(planChatAbierto===plan.id?null:plan.id)} className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800 transition-colors">💬 Ver Comentarios ({plan.comentarios?.length||0})</button>
                                                {planChatAbierto===plan.id && (
                                                    <div className="mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <div className="max-h-32 overflow-y-auto space-y-2 mb-3 custom-scrollbar">
                                                            {plan.comentarios?.map(c=><div key={c.id} className="text-xs bg-white p-2 rounded shadow-sm border border-slate-100"><span className="font-bold text-blue-800">{c.autor}: </span><span className="text-slate-700">{c.texto}</span></div>)}
                                                        </div>
                                                        <div className="flex gap-2"><input className="flex-1 text-xs border border-slate-300 rounded-md p-2 outline-none focus:border-blue-500 transition-colors" placeholder="Escribe tu respuesta..." value={nuevoComentario} onChange={e=>setNuevoComentario(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') enviarComentario(plan.id);}} /><button onClick={()=>enviarComentario(plan.id)} className="bg-blue-600 text-white px-3 rounded-md text-xs font-bold hover:bg-blue-700 transition-colors">Enviar</button></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : <p className="text-slate-400 text-sm italic">No tienes planes activos.</p>}
                    </div>
                </div>
             )}
             {vista === 'evaluaciones' && miDesempeno && ( <VistaEvaluaciones360 miDesempeno={miDesempeno} esLider={esLider} equipo={equipoLiderado} miLider={miLider} evaluaciones={evaluaciones} onSave={guardarEvaluacion} /> )}
        </div>
      </main>
    )
  }

  // ==========================================
  // VISTA 2 y 3: ADMIN Y LÍDER (MANAGER)
  // ==========================================
  const tituloPanel = esAdmin ? "🏢 Panel Corporativo" : `⭐ Panel de Liderazgo: ${areaLiderada?.nombre}`;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{tituloPanel}</h1>
            <div className="flex gap-6 text-sm mt-3 border-b border-slate-200 pb-0 overflow-x-auto">
                {esAdmin ? (
                    <>
                        <BtnMenu active={vista==='tablero'} onClick={()=>setVista('tablero')}>Tablero de Control</BtnMenu>
                        <BtnMenu active={vista==='organigrama'} onClick={()=>setVista('organigrama')}>Organigrama</BtnMenu>
                        <BtnMenu active={vista==='informes'} onClick={()=>setVista('informes')}>📊 BI & Analítica</BtnMenu>
                        <BtnMenu active={vista==='evaluaciones'} onClick={()=>setVista('evaluaciones')}>Evaluaciones 360</BtnMenu>
                    </>
                ) : (
                    <>
                        <BtnMenu active={vista==='mi_equipo'} onClick={()=>setVista('mi_equipo')}>Mi Equipo ({equipoLiderado.length})</BtnMenu>
                        <BtnMenu active={vista==='evaluaciones'} onClick={()=>setVista('evaluaciones')}>Evaluaciones 360</BtnMenu>
                        <BtnMenu active={vista==='informes'} onClick={()=>setVista('informes')}>📊 BI Team</BtnMenu>
                        <BtnMenu active={vista==='mi_perfil'} onClick={()=>setVista('mi_perfil')}>Mi Rendimiento</BtnMenu>
                    </>
                )}
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             {esAdmin && <><input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" /><button onClick={()=>fileInputRef.current?.click()} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700">Cargar Excel</button></>}
             <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-red-500 text-sm font-medium hover:text-red-700">Salir</button>
          </div>
        </div>

        {/* --- VISTAS OPERATIVAS (Tablero, Organigrama, Equipo) --- */}
        {esAdmin && vista === 'tablero' && ( 
            <div className="space-y-8 animate-in fade-in"> 
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-end"> 
                    <div className="flex flex-col gap-1"> 
                        <label className="text-xs font-bold text-slate-500 uppercase">Nueva Área</label> 
                        <input className="border border-slate-300 p-2 rounded-md text-sm bg-slate-50 w-64 outline-none focus:border-blue-500" placeholder="Ej: Ventas..." value={nuevaAreaNombre} onChange={e => setNuevaAreaNombre(e.target.value)} /> 
                    </div> 
                    <div className="flex flex-col gap-1"> 
                        <label className="text-xs font-bold text-slate-500 uppercase">Jerarquía</label> 
                        <select className="border border-slate-300 p-2 rounded-md text-sm bg-slate-50 w-64 outline-none focus:border-blue-500" value={nuevaAreaPadre} onChange={e => setNuevaAreaPadre(e.target.value)}> 
                            <option value="">-- Área Principal --</option> 
                            {areas.map(a => <option key={a.id} value={a.id}>Dentro de: {a.nombre}</option>)} 
                        </select> 
                    </div> 
                    <button onClick={crearArea} className="bg-slate-800 text-white px-6 py-2 rounded-md text-sm font-bold shadow-sm hover:bg-slate-900 transition-colors h-[38px]">Crear</button> 
                </div> 
                <div className="space-y-12"> 
                    {areas.map(area => { 
                        const miembrosArea = empleados.filter(e => e.area_id === area.id); 
                        return ( 
                            <div key={area.id} className="scroll-mt-6"> 
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-slate-200 pb-3 bg-white p-4 rounded-xl shadow-sm border"> 
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3"> <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-md text-sm shadow-sm border border-blue-200">Área</span> {area.nombre} </h2> 
                                    <div className="flex gap-6 items-center bg-slate-50 p-2 rounded-lg border border-slate-100"> 
                                        <div className="flex flex-col"> 
                                            <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Líder</span> 
                                            <select className="bg-white border border-slate-300 rounded-md text-sm py-1.5 px-2 outline-none focus:border-blue-500 w-48 shadow-sm" value={area.lider_id || ""} onChange={(e) => asignarLiderArea(area.id, e.target.value)}> 
                                                <option value="">-- Sin Asignar --</option> 
                                                {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)} 
                                            </select> 
                                        </div> 
                                        <div className="flex flex-col"> 
                                            <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Reporta a</span> 
                                            <select className="bg-white border border-slate-300 rounded-md text-sm py-1.5 px-2 outline-none focus:border-blue-500 w-48 shadow-sm" value={area.parent_id || ""} onChange={(e) => asignarPadreArea(area.id, e.target.value)}> 
                                                <option value="">(Principal)</option> 
                                                {areas.filter(a => a.id !== area.id).map(a => (<option key={a.id} value={a.id}>{a.nombre}</option>))} 
                                            </select> 
                                        </div> 
                                    </div> 
                                </div> 
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"> 
                                    {miembrosArea.map(emp => <TarjetaEmpleado key={emp.id} emp={emp} esLider={area.lider_id === emp.id} areas={areas} allowEdit={true} funciones={{asignarAreaEmpleado, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario}}/>)} 
                                </div> 
                            </div> 
                        ) 
                    })} 
                </div> 
                <div className="fixed bottom-8 right-8 bg-white p-3 rounded-full shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] flex gap-2 border border-slate-200 z-50"> 
                    <form onSubmit={agregarEmpleado} className="flex gap-2"> 
                        <input className="bg-slate-50 border border-slate-200 rounded-full px-4 text-sm w-36 outline-none focus:border-blue-500" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} required /> 
                        <input className="bg-slate-50 border border-slate-200 rounded-full px-4 text-sm w-48 outline-none focus:border-blue-500" placeholder="Email" value={emailEmpleado} onChange={e => setEmailEmpleado(e.target.value)} required /> 
                        <button className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg hover:bg-blue-700">+</button> 
                    </form> 
                </div> 
            </div> 
        )}
        {!esAdmin && vista === 'mi_equipo' && ( <div className="animate-in fade-in"> <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"> {equipoLiderado.map(emp => (<TarjetaEmpleado key={emp.id} emp={emp} esLider={false} areas={areas} allowEdit={true} funciones={{asignarAreaEmpleado: ()=>{}, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario}}/>))} </div> </div> )}
        {esAdmin && vista === 'organigrama' && ( <div className="bg-slate-100 p-8 rounded-xl overflow-x-auto overflow-y-auto h-[750px] flex justify-center items-start animate-in zoom-in-95 border border-slate-200 shadow-inner custom-scrollbar relative"><div className="absolute top-4 left-4 text-slate-300 font-bold text-2xl tracking-widest opacity-50 select-none">ESTRUCTURA ORGANIZACIONAL</div><div className="flex gap-16 pb-32 pt-10">{construirArbol(areas, empleados).map(areaRaiz => (<NodoOrganigrama key={areaRaiz.id} area={areaRaiz} />))}</div></div> )}
        {vista === 'evaluaciones' && ( esAdmin ? ( <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in"> <div className="p-6 border-b border-slate-100 bg-slate-50"><h3 className="font-bold text-slate-800">📋 Reporte Global de Evaluaciones 360</h3></div> <div className="p-6 grid gap-4"> {evaluaciones.length === 0 ? <p className="text-slate-400">Nadie ha enviado evaluaciones aún.</p> : evaluaciones.map(ev => { const evaluador = empleados.find(e => e.id === ev.evaluador_id)?.nombre; const evaluado = empleados.find(e => e.id === ev.evaluado_id)?.nombre; return ( <div key={ev.id} className="p-4 border border-slate-100 bg-slate-50 rounded-lg flex items-start gap-4"> <div className="text-2xl pt-1">{'⭐'.repeat(ev.puntuacion)}</div> <div> <p className="text-sm font-bold text-slate-800">{evaluador} <span className="text-slate-400 font-normal">evaluó a</span> {evaluado}</p> <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{ev.tipo}</span> <p className="text-sm text-slate-600 mt-2 italic">"{ev.feedback}"</p> </div> </div> ) })} </div> </div> ) : ( <VistaEvaluaciones360 miDesempeno={miDesempeno} esLider={esLider} equipo={equipoLiderado} miLider={miLider} evaluaciones={evaluaciones} onSave={guardarEvaluacion} /> ) )}

        {/* ========================================== */}
        {/* --- VISTA: BI DASHBOARD --- */}
        {/* ========================================== */}
        {vista === 'informes' && (
            <div className="animate-in slide-in-from-bottom-4 space-y-6">
                
                {/* FILA 1: KPIs Principales (Widgets) */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-5 rounded-xl shadow-md text-white">
                        <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">Rendimiento</p>
                        <h3 className="text-4xl font-black">{metricasBI.prom}%</h3>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Headcount</p>
                        <h3 className="text-3xl font-black text-slate-800">{metricasBI.total}</h3>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Planes Abiertos</p>
                        <h3 className="text-3xl font-black text-amber-500">{metricasBI.pendientes}</h3>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Logros (Done)</p>
                        <h3 className="text-3xl font-black text-emerald-500">{metricasBI.completados}</h3>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-5 rounded-xl shadow-md text-white">
                        <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">Clima (Eval 360)</p>
                        <h3 className="text-4xl font-black flex items-center gap-2">{metricasBI.promEvals} <span className="text-lg">⭐</span></h3>
                    </div>
                </div>
                
                {/* FILA 2: Gráficos Operativos */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {esAdmin && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">📊 Performance Index por Área</h3>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-medium">Mayor a Menor</span>
                            </div>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metricasBI.datosArea} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Bar dataKey="promedio" radius={[4, 4, 0, 0]} barSize={35}>
                                            {metricasBI.datosArea.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.promedio >= 80 ? '#10b981' : entry.promedio >= 60 ? '#3b82f6' : '#ef4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                    <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${!esAdmin ? 'lg:col-span-3' : ''}`}>
                         <h3 className="font-bold text-slate-800 mb-2">🎯 9-Box (Distribución Talentos)</h3>
                         <p className="text-xs text-slate-500 mb-4">Mapeo de la organización según rendimiento general.</p>
                         <div className="h-56 flex justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={metricasBI.distribucion} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none" label={({name, percent}) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                        {metricasBI.distribucion.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{fontWeight: 'bold', color: '#333'}} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '11px'}} />
                                </PieChart>
                            </ResponsiveContainer>
                         </div>
                    </div>
                </div>

                {/* FILA 3: Actionable Insights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">🌟 Top 5 Talentos</h3>
                        <div className="space-y-4">
                            {metricasBI.top5.map((emp, i) => (
                                <div key={emp.id} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">{i+1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <p className="text-xs font-bold text-slate-700 truncate w-32">{emp.nombre}</p>
                                            <p className="text-xs font-black text-emerald-600">{emp.cumplimiento_general}%</p>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1 mt-1"><div className="bg-emerald-500 h-1 rounded-full" style={{width: `${emp.cumplimiento_general}%`}}></div></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">⚠️ Alertas de Fuga</h3>
                        <div className="space-y-4">
                            {metricasBI.bottom5.length > 0 ? metricasBI.bottom5.map((emp, i) => (
                                <div key={emp.id} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs">!</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <p className="text-xs font-bold text-slate-700 truncate w-32">{emp.nombre}</p>
                                            <p className="text-xs font-black text-red-600">{emp.cumplimiento_general}%</p>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1 mt-1"><div className="bg-red-500 h-1 rounded-full" style={{width: `${emp.cumplimiento_general}%`}}></div></div>
                                    </div>
                                </div>
                            )) : <p className="text-xs text-slate-400 italic">No hay personal en riesgo crítico.</p>}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div>
                            <h3 className="font-bold text-slate-800 mb-1">🔄 Participación 360</h3>
                            <p className="text-xs text-slate-500 mb-4">Total de feedbacks emitidos: <strong className="text-indigo-600">{metricasBI.totalEvals}</strong></p>
                        </div>
                        <div className="flex-1 flex items-center justify-center min-h-[150px]">
                            {metricasBI.totalEvals > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={metricasBI.evalsPorTipo} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                                            {metricasBI.evalsPorTipo.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                                        <Legend verticalAlign="bottom" height={20} iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-xs text-slate-400 italic text-center">Inicia las evaluaciones para ver la data cruzada.</p>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        )}

        {!esAdmin && vista === 'mi_perfil' && miDesempeno && (
             <div className="max-w-3xl mx-auto bg-white p-10 rounded-2xl shadow-xl border-t-8 border-purple-600 animate-in fade-in zoom-in-95">
                 <h2 className="text-3xl font-black text-slate-800 mb-2">Mi Rendimiento</h2>
                 <div className="flex justify-between items-center mb-10 bg-purple-50 p-6 rounded-xl border border-purple-100">
                    <div><h3 className="text-6xl font-black text-purple-600">{miDesempeno.cumplimiento_general}%</h3></div>
                    <div className="text-right"><p className="text-lg font-bold text-slate-800">{miDesempeno.nombre}</p><p className="text-slate-500 font-medium">{miDesempeno.puesto}</p></div>
                 </div>
                 <div className="space-y-5">
                    {miDesempeno.indicadores?.map(ind => (<div key={ind.id} className="bg-slate-50 p-4 rounded-lg border border-slate-100"><div className="flex justify-between text-sm mb-2"><span className="font-semibold text-slate-700">{ind.titulo}</span><span className="font-black text-purple-600">{ind.progreso}%</span></div><div className="h-2.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full" style={{width:`${ind.progreso}%`}}></div></div></div>))}
                 </div>
             </div>
        )}

      </div>
    </main>
  )
}

// --- SUBVISTAS Y COMPONENTES AUXILIARES ---
function VistaEvaluaciones360({ miDesempeno, esLider, equipo, miLider, evaluaciones, onSave }: any) {
    if (!miDesempeno) return null;
    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 w-full">
            <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl text-sm text-indigo-900 shadow-sm flex items-center gap-3">
                <span className="text-2xl">🔄</span><p><strong>Evaluación 360°:</strong> Refleja tu desempeño y el de tu entorno para crecer juntos. Sé sincero y constructivo.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormEvaluacion evaluado={miDesempeno} tipo="autoevaluacion" titulo="Mi Autoevaluación" descripcion="¿Cómo evalúas tu propio desempeño este periodo?" miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="purple" />
                {miLider && ( <FormEvaluacion evaluado={miLider} tipo="ascendente" titulo={`Evaluación a mi Líder: ${miLider.nombre}`} descripcion="Evalúa el apoyo y gestión de tu jefe directo." miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="blue" /> )}
            </div>
            {esLider && equipo.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Evaluación de mi Equipo (Descendente)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {equipo.map((miembro: any) => ( <FormEvaluacion key={miembro.id} evaluado={miembro} tipo="descendente" titulo={`Evaluar a ${miembro.nombre}`} descripcion={miembro.puesto} miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="emerald" /> ))}
                    </div>
                </div>
            )}
        </div>
    )
}
function FormEvaluacion({ evaluado, tipo, titulo, descripcion, miId, evaluaciones, onSave, colorTheme }: any) {
    const yaEvaluado = evaluaciones.find((e:any) => e.evaluador_id === miId && e.evaluado_id === evaluado.id && e.tipo === tipo);
    const [puntuacion, setPuntuacion] = useState(0); const [feedback, setFeedback] = useState("");
    const bgMap:any = { purple: 'bg-purple-50 border-purple-200', blue: 'bg-blue-50 border-blue-200', emerald: 'bg-emerald-50 border-emerald-200' };
    const textMap:any = { purple: 'text-purple-800', blue: 'text-blue-800', emerald: 'text-emerald-800' };
    if (yaEvaluado) {
        return ( <div className={`p-6 rounded-xl border opacity-70 ${bgMap[colorTheme]}`}> <h4 className={`font-bold mb-1 ${textMap[colorTheme]}`}>✅ {titulo} completada</h4> <div className="text-2xl tracking-widest my-2">{'⭐'.repeat(yaEvaluado.puntuacion)}</div> <p className="text-xs text-slate-600 italic">"{yaEvaluado.feedback}"</p> </div> )
    }
    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="font-bold text-slate-800 mb-1">{titulo}</h4> <p className="text-xs text-slate-500 mb-4">{descripcion}</p>
            <div className="mb-4"> <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Puntuación (1 a 5)</p> <div className="flex gap-2"> {[1, 2, 3, 4, 5].map(num => ( <button key={num} onClick={() => setPuntuacion(num)} className={`w-8 h-8 rounded-full font-bold text-sm transition-colors ${puntuacion >= num ? 'bg-amber-400 text-white shadow-inner' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>★</button> ))} </div> </div>
            <textarea className="w-full text-xs border border-slate-300 rounded-md p-3 outline-none focus:border-blue-500 mb-3 resize-none h-20" placeholder="Escribe tu retroalimentación detallada y constructiva..." value={feedback} onChange={e => setFeedback(e.target.value)}></textarea>
            <button onClick={() => onSave(evaluado.id, tipo, puntuacion, feedback)} className={`w-full text-white font-bold py-2 rounded-md text-sm transition-colors ${puntuacion > 0 && feedback ? 'bg-slate-800 hover:bg-slate-900' : 'bg-slate-300 cursor-not-allowed'}`}> Enviar Evaluación </button>
        </div>
    )
}

function BtnMenu({children, active, onClick}:any) { return <button onClick={onClick} className={`font-bold px-1 py-3 whitespace-nowrap transition-colors ${active ? 'text-blue-600 border-b-[3px] border-blue-600' : 'text-slate-400 hover:text-slate-600 hover:border-b-[3px] hover:border-slate-300'}`}>{children}</button> }
function CardKpi({title, value, sub, color}:any) { return <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow"><p className="text-sm text-slate-500 font-bold uppercase tracking-wide">{title}</p><h3 className={`text-5xl font-black mt-3 mb-1 ${color}`}>{value}</h3><p className="text-xs text-slate-400 font-medium">{sub}</p></div> }
function construirArbol(areas:Area[], empleados:Empleado[]) { const areaMap = new Map(); areas.forEach(a => areaMap.set(a.id, { ...a, children: [], empleados: [] })); empleados.forEach(e => { if (e.area_id && areaMap.has(e.area_id)) areaMap.get(e.area_id).empleados.push(e); }); const raiz: Area[] = []; areaMap.forEach(area => { if (area.parent_id && areaMap.has(area.parent_id)) areaMap.get(area.parent_id).children.push(area); else raiz.push(area); }); return raiz; }
function NodoOrganigrama({ area }: { area: Area }) { return ( <div className="flex flex-col items-center"> <div className="relative flex flex-col w-56 bg-white rounded-xl shadow-md border border-slate-200 transition-transform hover:-translate-y-1 hover:shadow-xl z-10"> {area.lider_id && ( <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1 border border-white whitespace-nowrap z-20"> 👑 Lider Asignado </div> )} <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-3 rounded-t-xl text-center border-b-4 border-blue-500"> <h3 className="font-bold text-sm tracking-wide truncate px-2" title={area.nombre}>{area.nombre}</h3> </div> <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-slate-50 rounded-b-xl"> {area.empleados && area.empleados.length > 0 ? ( area.empleados.map(emp => ( <div key={emp.id} className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm hover:border-blue-300 transition-colors"> <span className="truncate w-32 font-medium" title={emp.nombre}>{emp.nombre}</span> <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${emp.cumplimiento_general < 70 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}> {emp.cumplimiento_general}% </span> </div> )) ) : ( <div className="text-[10px] text-slate-400 text-center py-3 italic">Sin asignaciones</div> )} </div> </div> {area.children && area.children.length > 0 && ( <> <div className="w-[2px] h-8 bg-slate-300"></div> <div className="flex justify-center"> {area.children.map((hijo, index) => { const isFirst = index === 0; const isLast = index === area.children.length - 1; const isOnly = area.children!.length === 1; return ( <div key={hijo.id} className="relative flex flex-col items-center pt-8 px-2 md:px-4"> {!isOnly && ( <div className={`absolute top-0 h-[2px] bg-slate-300 ${isFirst ? 'left-1/2 right-0' : ''} ${isLast ? 'left-0 right-1/2' : ''} ${!isFirst && !isLast ? 'left-0 right-0' : ''} `}></div> )} <div className="absolute top-0 w-[2px] h-8 bg-slate-300 left-1/2 -translate-x-1/2"></div> <NodoOrganigrama area={hijo} /> </div> ) })} </div> </> )} </div> ) }
function TarjetaEmpleado({ emp, esLider, areas, allowEdit, funciones }: any) { const { asignarAreaEmpleado, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario } = funciones; return ( <div className={`bg-white rounded-xl shadow-sm border p-6 transition-all duration-300 hover:shadow-md ${esLider ? 'border-blue-400 ring-2 ring-blue-400 shadow-blue-100' : 'border-slate-200'}`}> <div className="flex justify-between items-start mb-4"> <div> <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg"> {emp.nombre} {esLider && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-black tracking-widest border border-blue-200">LÍDER</span>} </h3> <p className="text-xs text-slate-500 font-medium mt-0.5">{emp.puesto}</p> {allowEdit && ( <select className="mt-2 text-[10px] bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-slate-600 outline-none focus:border-blue-400 w-full" value={emp.area_id || ""} onChange={(e) => asignarAreaEmpleado(emp.id, e.target.value)}> <option value="">-- Reasignar Área --</option> {areas.map((a:any) => <option key={a.id} value={a.id}>{a.nombre}</option>)} </select> )} </div> <div className="flex flex-col items-end"> <span className={`text-3xl font-black transition-all duration-500 ${emp.cumplimiento_general < 70 ? 'text-red-500' : 'text-blue-600'}`}>{emp.cumplimiento_general}%</span> <span className="text-[9px] text-slate-400 uppercase font-bold mt-1">Score</span> </div> </div> <div className="w-full bg-slate-100 rounded-full h-2 mb-5 overflow-hidden"> <div className={`h-2 rounded-full transition-all duration-1000 ${emp.cumplimiento_general < 70 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${emp.cumplimiento_general}%` }}></div> </div> {emp.planes_mejora?.length > 0 && ( <div className="mt-5 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 px-6 pb-2"> <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">🚀 Action Plans</p> <div className="space-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar"> {emp.planes_mejora.filter((p:any)=>allowEdit?true:p.estado!=='completado').map((plan:any) => { const gantt = calcularGantt(plan.created_at, plan.fecha_limite); return ( <div key={plan.id} className="relative bg-white p-3 rounded-lg border border-slate-200 shadow-sm"> <div className="flex justify-between items-center mb-2"> <span className={`text-xs font-semibold w-[60%] truncate ${plan.estado==='completado' ? 'text-slate-400 line-through' : 'text-slate-700'}`} title={plan.compromiso}>{plan.compromiso}</span> <div className="flex gap-1.5"> <button onClick={() => setPlanChatAbierto(planChatAbierto === plan.id ? null : plan.id)} className={`text-[10px] px-2 py-1 rounded-md font-bold transition-colors ${plan.comentarios?.length > 0 ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}> 💬 {plan.comentarios?.length || 0} </button> {allowEdit && ( <button onClick={() => completarPlan(plan.id, plan.estado)} className={`text-[10px] px-2 py-1 rounded-md font-black border transition-colors ${plan.estado === 'completado' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-green-50 hover:text-green-600 hover:border-green-300'}`}> {plan.estado === 'completado' ? 'UNDO' : '✔ OK'} </button> )} </div> </div> {plan.estado !== 'completado' && ( <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative mt-1.5 mb-1"> <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${gantt.esVencido ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${gantt.porcentajeAvance}%` }}></div> </div> )} <div className="flex justify-between px-1 text-[8px] font-bold text-slate-400 uppercase mt-1"> <span>{gantt.fechaInicioStr}</span> <span className={gantt.esVencido && plan.estado !== 'completado' ? 'text-red-500' : ''}>{plan.estado === 'completado' ? 'Completado' : (gantt.esVencido ? 'Vencido' : gantt.fechaFinStr)}</span> </div> {planChatAbierto === plan.id && ( <div className="mt-3 bg-slate-50 p-2 rounded-lg border border-slate-200 animate-in slide-in-from-top-2"> <div className="max-h-32 overflow-y-auto space-y-2 mb-2 custom-scrollbar"> {plan.comentarios?.map((c:any) => ( <div key={c.id} className="text-[10px] bg-white p-2 rounded shadow-sm border border-slate-100"> <span className="font-black text-blue-800">{c.autor}: </span><span className="text-slate-600">{c.texto}</span> </div> ))} {(!plan.comentarios || plan.comentarios.length === 0) && <p className="text-[10px] text-slate-400 italic text-center py-2">No hay comentarios aún.</p>} </div> <div className="flex gap-1.5"> <input className="flex-1 text-[10px] border border-slate-300 rounded-md p-1.5 outline-none focus:border-blue-400" placeholder="Añadir comentario..." value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)} onKeyDown={e => {if(e.key === 'Enter') enviarComentario(plan.id)}} /> <button onClick={() => enviarComentario(plan.id)} className="bg-blue-600 text-white px-3 rounded-md text-[10px] font-bold hover:bg-blue-700">Enviar</button> </div> </div> )} </div> ) })} </div> </div> )} {allowEdit && emp.cumplimiento_general < 70 && ( <div className="mt-4 flex gap-2"> <input className="flex-1 text-xs border border-red-200 bg-red-50 p-2 rounded-md text-red-800 outline-none focus:ring-1 focus:ring-red-400 placeholder:text-red-300" placeholder="Asignar compromiso..." value={textosPlanes[emp.id] || ''} onChange={e => setTextosPlanes({ ...textosPlanes, [emp.id]: e.target.value })} /> <select className="text-xs border border-red-200 bg-red-50 text-red-800 rounded-md outline-none" value={diasPlanes[emp.id] || 7} onChange={e => setDiasPlanes({ ...diasPlanes, [emp.id]: parseInt(e.target.value) })}> <option value={3}>3d</option><option value={7}>7d</option><option value={15}>15d</option> </select> <button onClick={() => crearPlan(emp.id)} className="bg-red-500 text-white px-3 rounded-md font-black hover:bg-red-600 transition-colors">+</button> </div> )} <button onClick={() => setExpandidoId(expandidoId === emp.id ? null : emp.id)} className={`mt-4 w-full text-center text-[10px] py-2 rounded-md transition-colors font-bold uppercase tracking-widest ${expandidoId === emp.id ? 'bg-slate-100 text-slate-500' : 'text-blue-500 bg-blue-50 hover:bg-blue-100'}`}> {expandidoId === emp.id ? '▲ Ocultar KPIs' : '▼ Gestionar KPIs'} </button> {expandidoId === emp.id && ( <div className="mt-2 pt-4 border-t border-slate-200 bg-slate-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-xl"> {emp.indicadores?.map((ind:any) => ( <div key={ind.id} className="mb-4"> <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-700"> <span>{ind.titulo}</span> <span className={ind.progreso < 70 ? 'text-red-500' : 'text-blue-600'}>{ind.progreso}%</span> </div> {allowEdit ? ( <input type="range" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" value={ind.progreso} onChange={(e) => actualizarIndicador(ind.id, parseInt(e.target.value), emp.id)} /> ) : ( <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{width:`${ind.progreso}%`}}></div></div> )} </div> ))} {allowEdit && ( <div className="flex gap-2 mt-5 pt-4 border-t border-slate-200"> <input className="flex-1 p-2 text-xs border border-slate-300 rounded-md outline-none focus:border-slate-500" placeholder="Nombre del nuevo KPI..." value={nuevoIndicador} onChange={e => setNuevoIndicador(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') agregarIndicador(emp.id);}} /> <button onClick={() => agregarIndicador(emp.id)} className="bg-slate-800 text-white px-4 rounded-md text-xs font-bold hover:bg-slate-900 transition-colors">Añadir</button> </div> )} </div> )} </div> ) }