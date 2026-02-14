'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- TIPOS DE DATOS ---
interface Area {
  id: number;
  nombre: string;
  lider_id: number | null;
  parent_id: number | null;
  children?: Area[];
  empleados?: Empleado[];
}
interface Indicador { id: number; titulo: string; progreso: number; }
interface Comentario { id: number; autor: string; texto: string; created_at: string; }
interface Plan { id: number; compromiso: string; estado: string; fecha_limite: string; created_at: string; comentarios?: Comentario[]; }
interface Empleado {
  id: number;
  nombre: string;
  puesto: string;
  email: string;
  cumplimiento_general: number;
  area_id: number | null;
  indicadores?: Indicador[];
  planes_mejora?: Plan[];
}

export default function DashboardPerformance() {
  // --- ESTADOS ---
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // ROLES Y VISTAS
  const [esLider, setEsLider] = useState(false)
  const [areaLiderada, setAreaLiderada] = useState<Area | null>(null)
  const [equipoLiderado, setEquipoLiderado] = useState<Empleado[]>([])
  const [vista, setVista] = useState<'tablero' | 'organigrama' | 'informes' | 'mi_equipo' | 'mi_perfil'>('tablero')

  // UI States
  const [nombre, setNombre] = useState(''); const [puesto, setPuesto] = useState(''); const [emailEmpleado, setEmailEmpleado] = useState('');
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState(''); const [nuevaAreaPadre, setNuevaAreaPadre] = useState<string>("");
  const [expandidoId, setExpandidoId] = useState<number | null>(null); const [nuevoIndicador, setNuevoIndicador] = useState('');
  const [textosPlanes, setTextosPlanes] = useState<{ [key: number]: string }>({}); const [diasPlanes, setDiasPlanes] = useState<{ [key: number]: number }>({});
  const [planChatAbierto, setPlanChatAbierto] = useState<number | null>(null); const [nuevoComentario, setNuevoComentario] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => { verificarUsuario() }, [])

  // --- LÓGICA DE TIEMPO ---
  function calcularGantt(creado: string, limite: string) {
    const inicio = new Date(creado).getTime(); const fin = new Date(limite).getTime(); const hoy = new Date().getTime();
    const duracion = fin - inicio; const transcurrido = hoy - inicio;
    let avance = duracion > 0 ? (transcurrido / duracion) * 100 : 0;
    if (avance > 100) avance = 100; if (avance < 0) avance = 0;
    const dias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    return { porcentajeAvance: avance, diasRestantes: dias, fechaInicioStr: new Date(creado).toLocaleDateString('es-ES', opts), fechaFinStr: new Date(limite).toLocaleDateString('es-ES', opts), esVencido: dias < 0 };
  }

  // --- CARGA DE DATOS INTELIGENTE ---
  async function verificarUsuario() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: perfilData } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    setPerfil(perfilData)

    if (perfilData?.rol === 'admin') {
      obtenerDatosCorporativos() // Admin ve todo
    } else {
      // Es empleado, verificamos si es Líder
      await identificarRolEmpleado(session.user.email!)
    }
    setLoading(false)
  }

  async function obtenerDatosCorporativos() {
    const { data: areasData } = await supabase.from('areas').select('*').order('id');
    const { data: empData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').order('id', { ascending: true })
    if (areasData) setAreas(areasData);
    if (empData) {
       const dataOrdenada = empData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) }))
       setEmpleados(dataOrdenada)
    }
  }

  async function identificarRolEmpleado(email: string) {
    // 1. Cargar mis datos
    const { data: miData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').eq('email', email).single()
    if (miData) {
       setMiDesempeno({ ...miData, planes_mejora: miData.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) });

       // 2. Verificar si lidera alguna área
       const { data: areaLider } = await supabase.from('areas').select('*').eq('lider_id', miData.id).single();
       
       if (areaLider) {
         setEsLider(true);
         setAreaLiderada(areaLider);
         setVista('mi_equipo'); // Vista por defecto para líder
         // Cargar datos de SU equipo
         const { data: equipoData } = await supabase.from('empleados').select('*, indicadores(*), planes_mejora(*, comentarios(*))').eq('area_id', areaLider.id).order('id');
         if (equipoData) {
            const equipoOrdenado = equipoData.map((emp: any) => ({ ...emp, planes_mejora: emp.planes_mejora.sort((a:Plan,b:Plan)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()) }))
            setEquipoLiderado(equipoOrdenado);
         }
       } else {
         setVista('mi_perfil'); // Vista por defecto para individual
       }
    }
  }

  // --- CRUD HELPERS ---
  const recargarDatos = () => {
    if (perfil?.rol === 'admin') obtenerDatosCorporativos();
    else if (esLider && perfil?.email) identificarRolEmpleado(perfil.email); 
    else if (perfil?.email) identificarRolEmpleado(perfil.email);
  }

  // (Todas las funciones CRUD: Excel, Áreas, Empleados, Indicadores, Planes, Comentarios...)
  // Se mantienen igual pero llaman a recargarDatos() al final.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      for (const row of data) {
        if (row['Email'] || row['email']) {
           let areaId = null; const areaName = row['Area'] || row['area'];
           if (areaName) {
             const exist = areas.find(a => a.nombre.toLowerCase() === areaName.toLowerCase());
             if (exist) areaId = exist.id;
             else { const { data } = await supabase.from('areas').insert([{ nombre: areaName }]).select().single(); if(data) areaId = data.id; }
           }
           await supabase.from('empleados').insert([{ nombre: row['Nombre']||row['nombre']||'X', email: row['Email']||row['email'], puesto: row['Puesto']||row['puesto']||'Emp', area_id: areaId, cumplimiento_general: 0 }]);
        }
      }
      alert("Carga completada."); window.location.reload();
    };
    reader.readAsBinaryString(file);
  };
  async function crearArea(){ if(!nuevaAreaNombre)return; const pid=nuevaAreaPadre?parseInt(nuevaAreaPadre):null; await supabase.from('areas').insert([{nombre:nuevaAreaNombre, parent_id:pid}]); setNuevaAreaNombre(''); setNuevaAreaPadre(""); recargarDatos();}
  async function asignarPadreArea(aid:number, pid:string){ const npid=pid===""?null:parseInt(pid); if(npid===aid)return; await supabase.from('areas').update({parent_id:npid}).eq('id',aid); recargarDatos();}
  async function asignarLiderArea(aid:number, lid:string){ const nlid=lid===""?null:parseInt(lid); await supabase.from('areas').update({lider_id:nlid}).eq('id',aid); recargarDatos();}
  async function asignarAreaEmpleado(eid:number, aid:string){ const naid=aid===""?null:parseInt(aid); await supabase.from('empleados').update({area_id:naid}).eq('id',eid); recargarDatos();}
  async function agregarEmpleado(e:React.FormEvent){ e.preventDefault(); await supabase.from('empleados').insert([{nombre,puesto,email:emailEmpleado,cumplimiento_general:0}]); setNombre('');setPuesto('');setEmailEmpleado(''); recargarDatos();}
  async function agregarIndicador(eid:number){ if(!nuevoIndicador)return; await supabase.from('indicadores').insert([{empleado_id:eid, titulo:nuevoIndicador,progreso:0}]); setNuevoIndicador(''); recargarDatos();}
  async function actualizarIndicador(id:number, val:number, eid:number){ 
      // Optimistic Update Local
      const targetList = perfil?.rol === 'admin' ? empleados : equipoLiderado;
      const setter = perfil?.rol === 'admin' ? setEmpleados : setEquipoLiderado;
      const updated = targetList.map(emp => {
          if (emp.id === eid) {
             const inds = emp.indicadores?.map(i => i.id === id ? {...i, progreso:val} : i) || [];
             const prom = inds.length > 0 ? Math.round(inds.reduce((a,b)=>a+b.progreso,0)/inds.length) : 0;
             return {...emp, indicadores:inds, cumplimiento_general:prom};
          }
          return emp;
      });
      setter(updated);
      await supabase.from('indicadores').update({progreso:val}).eq('id',id);
  }
  async function crearPlan(eid:number){ const txt=textosPlanes[eid]; const d=diasPlanes[eid]||7; if(!txt)return; const lim=new Date(); lim.setDate(lim.getDate()+d); await supabase.from('planes_mejora').insert([{empleado_id:eid, compromiso:txt, created_at:new Date().toISOString(), fecha_limite:lim.toISOString(), estado:'pendiente'}]); setTextosPlanes({...textosPlanes,[eid]:''}); recargarDatos();}
  async function completarPlan(pid:number, est:string){ const nest=est==='pendiente'?'completado':'pendiente'; await supabase.from('planes_mejora').update({estado:nest}).eq('id',pid); recargarDatos();}
  async function enviarComentario(pid:number){ if(!nuevoComentario)return; await supabase.from('comentarios').insert([{plan_id:pid, autor:perfil.nombre, texto:nuevoComentario}]); setNuevoComentario(''); recargarDatos();}

  // --- CÁLCULOS BI (Para Admin y Líder) ---
  const dataParaMetricas = perfil?.rol === 'admin' ? empleados : equipoLiderado;
  const metricas = useMemo(() => {
    const total = dataParaMetricas.length;
    const prom = total > 0 ? Math.round(dataParaMetricas.reduce((a,b)=>a+b.cumplimiento_general,0)/total) : 0;
    const bajo = dataParaMetricas.filter(e=>e.cumplimiento_general<60).length;
    const medio = dataParaMetricas.filter(e=>e.cumplimiento_general>=60 && e.cumplimiento_general<85).length;
    const alto = dataParaMetricas.filter(e=>e.cumplimiento_general>=85).length;
    return { 
        total, prom, 
        distribucion: [{name:'Riesgo',value:bajo,color:'#EF4444'},{name:'Estándar',value:medio,color:'#F59E0B'},{name:'Alto',value:alto,color:'#10B981'}].filter(d=>d.value>0),
        pendientes: dataParaMetricas.flatMap(e=>e.planes_mejora||[]).filter(p=>p.estado==='pendiente').length 
    };
  }, [dataParaMetricas]);

  if (loading) return <div className="p-10 text-center">Cargando...</div>

  // ==========================================
  // VISTA 1: COLABORADOR INDIVIDUAL (Sin Equipo)
  // ==========================================
  if (perfil?.rol !== 'admin' && !esLider) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Hola, {perfil?.nombre} 👋</h1>
                <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-red-500 text-sm">Salir</button>
            </div>
             {miDesempeno ? (
                <div className="space-y-6 animate-in slide-in-from-bottom-4">
                    {/* TARJETA PRINCIPAL */}
                    <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-blue-600">
                        <div className="flex justify-between items-end mb-4">
                            <div><h3 className="text-4xl font-bold text-blue-600">{miDesempeno.cumplimiento_general}%</h3><p className="text-gray-500">Rendimiento General</p></div>
                            <div className="text-right text-sm text-gray-400"><p>{miDesempeno.puesto}</p><p>{miDesempeno.email}</p></div>
                        </div>
                        <div className="space-y-3">
                            {miDesempeno.indicadores?.map(ind => (
                                <div key={ind.id}>
                                    <div className="flex justify-between text-sm mb-1"><span>{ind.titulo}</span><span className="font-bold">{ind.progreso}%</span></div>
                                    <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width:`${ind.progreso}%`}}></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* EVOLUCIÓN (PLANES DE MEJORA) */}
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-4">📈 Evolución y Compromisos</h3>
                        {miDesempeno.planes_mejora && miDesempeno.planes_mejora.length > 0 ? (
                            <div className="space-y-4">
                                {miDesempeno.planes_mejora.map(plan => {
                                    const gantt = calcularGantt(plan.created_at, plan.fecha_limite);
                                    return (
                                        <div key={plan.id} className={`p-4 rounded-lg border-l-4 ${plan.estado === 'completado' ? 'bg-green-50 border-green-500' : 'bg-white border-blue-500 shadow-sm'}`}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-medium text-sm">{plan.compromiso}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${plan.estado==='completado'?'bg-green-200 text-green-800':'bg-blue-100 text-blue-800'}`}>{plan.estado}</span>
                                            </div>
                                            <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div className={`absolute top-0 left-0 h-full ${gantt.esVencido?'bg-red-400':'bg-blue-400'}`} style={{width:`${gantt.porcentajeAvance}%`}}></div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                                <span>Inicio: {gantt.fechaInicioStr}</span>
                                                <span className={gantt.esVencido?'text-red-500 font-bold':''}>{gantt.esVencido ? 'Vencido' : `Meta: ${gantt.fechaFinStr}`}</span>
                                            </div>
                                            {/* Chat modo lectura/respuesta */}
                                            <div className="mt-3 pt-2 border-t border-gray-100">
                                                <button onClick={() => setPlanChatAbierto(planChatAbierto===plan.id?null:plan.id)} className="text-xs text-blue-600 flex items-center gap-1">💬 Ver Comentarios ({plan.comentarios?.length||0})</button>
                                                {planChatAbierto===plan.id && (
                                                    <div className="mt-2 bg-gray-50 p-2 rounded">
                                                        <div className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                                            {plan.comentarios?.map(c=><div key={c.id} className="text-xs bg-white p-1.5 rounded shadow-sm"><span className="font-bold">{c.autor}: </span>{c.texto}</div>)}
                                                        </div>
                                                        <div className="flex gap-1"><input className="flex-1 text-xs border rounded p-1" placeholder="Responder..." value={nuevoComentario} onChange={e=>setNuevoComentario(e.target.value)} /><button onClick={()=>enviarComentario(plan.id)} className="bg-blue-600 text-white px-2 rounded text-xs">→</button></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : <p className="text-gray-400 text-sm italic">No tienes planes activos.</p>}
                    </div>
                </div>
             ) : <div className="text-center p-10">Cargando tu perfil...</div>}
        </div>
      </main>
    )
  }

  // ==========================================
  // VISTA 2 y 3: ADMIN Y LÍDER (MANAGER)
  // ==========================================
  const esAdmin = perfil?.rol === 'admin';
  const tituloPanel = esAdmin ? "🏢 Panel Corporativo (Admin)" : `⭐ Panel de Liderazgo: ${areaLiderada?.nombre}`;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tituloPanel}</h1>
            <div className="flex gap-6 text-sm mt-2 border-b border-gray-100 pb-1">
                {/* Menú Dinámico */}
                {esAdmin ? (
                    <>
                        <BtnMenu active={vista==='tablero'} onClick={()=>setVista('tablero')}>Tablero</BtnMenu>
                        <BtnMenu active={vista==='organigrama'} onClick={()=>setVista('organigrama')}>Organigrama</BtnMenu>
                        <BtnMenu active={vista==='informes'} onClick={()=>setVista('informes')}>Informes Globales</BtnMenu>
                    </>
                ) : (
                    <>
                        <BtnMenu active={vista==='mi_equipo'} onClick={()=>setVista('mi_equipo')}>Mi Equipo ({equipoLiderado.length})</BtnMenu>
                        <BtnMenu active={vista==='informes'} onClick={()=>setVista('informes')}>Analítica de Área</BtnMenu>
                        <BtnMenu active={vista==='mi_perfil'} onClick={()=>setVista('mi_perfil')}>Mi Rendimiento</BtnMenu>
                    </>
                )}
            </div>
          </div>
          <div className="flex items-center gap-3">
             {esAdmin && <><input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" /><button onClick={()=>fileInputRef.current?.click()} className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700">Subir Excel</button></>}
             <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-red-500 text-sm font-medium">Salir</button>
          </div>
        </div>

        {/* --- CONTENIDO --- */}

        {/* 1. VISTA TABLERO (Solo Admin) */}
        {esAdmin && vista === 'tablero' && (
            <div className="space-y-8 animate-in fade-in">
                {/* Crear Área */}
                <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-wrap gap-2 items-center">
                    <span className="text-sm font-bold">Nueva Área:</span>
                    <input className="border p-1.5 rounded text-xs bg-gray-50" placeholder="Nombre" value={nuevaAreaNombre} onChange={e => setNuevaAreaNombre(e.target.value)} />
                    <select className="border p-1.5 rounded text-xs bg-gray-50" value={nuevaAreaPadre} onChange={e => setNuevaAreaPadre(e.target.value)}><option value="">-- Principal --</option>{areas.map(a => <option key={a.id} value={a.id}>Dentro de: {a.nombre}</option>)}</select>
                    <button onClick={crearArea} className="bg-gray-900 text-white px-3 rounded text-xs">Crear</button>
                </div>
                <div className="space-y-12">
                    {areas.map(area => {
                        const miembrosArea = empleados.filter(e => e.area_id === area.id);
                        return (
                            <div key={area.id}>
                                <div className="flex justify-between gap-4 mb-4 border-b pb-2 bg-gray-50 p-3 rounded-lg border">
                                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">Área</span> {area.nombre}</h2>
                                    <div className="flex gap-4"><div className="flex flex-col"><span className="text-[10px] text-gray-400 font-bold uppercase">Líder</span><select className="bg-white border rounded text-sm py-1" value={area.lider_id || ""} onChange={(e) => asignarLiderArea(area.id, e.target.value)}><option value="">-- Asignar --</option>{empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div><div className="flex flex-col"><span className="text-[10px] text-gray-400 font-bold uppercase">Reporta a</span><select className="bg-white border rounded text-sm py-1 w-40" value={area.parent_id || ""} onChange={(e) => asignarPadreArea(area.id, e.target.value)}><option value="">(Principal)</option>{areas.filter(a => a.id !== area.id).map(a => (<option key={a.id} value={a.id}>{a.nombre}</option>))}</select></div></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {miembrosArea.map(emp => <TarjetaEmpleado key={emp.id} emp={emp} esLider={area.lider_id === emp.id} areas={areas} allowEdit={true} funciones={{asignarAreaEmpleado, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario}}/>)}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="fixed bottom-6 right-6 bg-white p-4 rounded-full shadow-2xl flex gap-2 border"><form onSubmit={agregarEmpleado} className="flex gap-2"><input className="bg-gray-50 border rounded px-2 text-sm w-32" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} required /><input className="bg-gray-50 border rounded px-2 text-sm w-32" placeholder="Email" value={emailEmpleado} onChange={e => setEmailEmpleado(e.target.value)} required /><button className="bg-blue-600 text-white rounded-full w-8 h-8 font-bold">+</button></form></div>
            </div>
        )}

        {/* 2. VISTA MI EQUIPO (Solo Líder) */}
        {!esAdmin && vista === 'mi_equipo' && (
            <div className="animate-in fade-in">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 text-sm text-blue-800">
                    Estás gestionando el equipo de <strong>{areaLiderada?.nombre}</strong>. Tienes acceso completo para asignar metas y planes de mejora a estos colaboradores.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {equipoLiderado.map(emp => (
                        <TarjetaEmpleado key={emp.id} emp={emp} esLider={false} areas={areas} allowEdit={true} // El líder puede editar
                            funciones={{asignarAreaEmpleado: ()=>{}, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario}}
                        />
                    ))}
                </div>
            </div>
        )}

        {/* 3. VISTA ORGANIGRAMA (Solo Admin) */}
        {esAdmin && vista === 'organigrama' && (
             <div className="bg-gray-100 p-8 rounded-xl overflow-x-auto min-h-[500px] flex justify-center animate-in zoom-in-95">
                <div className="flex gap-8">{construirArbol(areas, empleados).map(areaRaiz => (<NodoOrganigrama key={areaRaiz.id} area={areaRaiz} />))}</div>
            </div>
        )}

        {/* 4. VISTA INFORMES (Admin + Líder) */}
        {vista === 'informes' && (
            <div className="animate-in slide-in-from-bottom-4 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <CardKpi title="Promedio Equipo" value={`${metricas.prom}%`} sub="Cumplimiento" color={metricas.prom>=70?'text-blue-600':'text-red-500'} />
                    <CardKpi title="Total Personas" value={metricas.total} sub="En tu alcance" color="text-gray-800" />
                    <CardKpi title="Planes Pendientes" value={metricas.pendientes} sub="Acciones abiertas" color="text-yellow-500" />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="font-bold text-gray-700 mb-6">Curva de Rendimiento del Equipo</h3>
                     <div className="h-64 flex justify-center"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={metricas.distribucion} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>{metricas.distribucion.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
                </div>
            </div>
        )}

        {/* 5. VISTA MI PERFIL (Para Líder viendo su propia data) */}
        {!esAdmin && vista === 'mi_perfil' && miDesempeno && (
             <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border-t-4 border-purple-600 animate-in fade-in">
                 <h2 className="text-2xl font-bold mb-4">Mi Rendimiento Personal</h2>
                 <div className="flex justify-between items-end mb-6">
                    <h3 className="text-5xl font-bold text-purple-600">{miDesempeno.cumplimiento_general}%</h3>
                    <p className="text-gray-500">{miDesempeno.puesto}</p>
                 </div>
                 <div className="space-y-3">{miDesempeno.indicadores?.map(ind => (<div key={ind.id}><div className="flex justify-between text-sm mb-1"><span>{ind.titulo}</span><span className="font-bold">{ind.progreso}%</span></div><div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-purple-500 rounded-full" style={{width:`${ind.progreso}%`}}></div></div></div>))}</div>
             </div>
        )}

      </div>
    </main>
  )
}

// --- COMPONENTES AUXILIARES ---
function BtnMenu({children, active, onClick}:any) { return <button onClick={onClick} className={`font-bold pb-1 ${active ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>{children}</button> }
function CardKpi({title, value, sub, color}:any) { return <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"><p className="text-sm text-gray-500 font-medium">{title}</p><h3 className={`text-4xl font-bold mt-2 ${color}`}>{value}</h3><p className="text-xs text-gray-400 mt-1">{sub}</p></div> }
function construirArbol(areas:Area[], empleados:Empleado[]) {
    const areaMap = new Map(); areas.forEach(a => areaMap.set(a.id, { ...a, children: [], empleados: [] }));
    empleados.forEach(e => { if (e.area_id && areaMap.has(e.area_id)) areaMap.get(e.area_id).empleados.push(e); });
    const raiz: Area[] = []; areaMap.forEach(area => { if (area.parent_id && areaMap.has(area.parent_id)) areaMap.get(area.parent_id).children.push(area); else raiz.push(area); });
    return raiz;
}
function NodoOrganigrama({ area }: { area: Area }) {
    return (
        <div className="flex flex-col items-center">
            <div className="bg-white border-2 border-blue-600 rounded-lg p-3 w-48 text-center shadow-lg relative z-10 mb-4">
                <h3 className="font-bold text-gray-800 text-sm">{area.nombre}</h3>
                <div className="mt-2 text-left space-y-1 max-h-32 overflow-y-auto custom-scrollbar">{area.empleados?.map(emp => (<div key={emp.id} className="text-[10px] text-gray-600 bg-gray-50 p-1 rounded border flex justify-between"><span className="truncate">{emp.nombre}</span><span className={`font-bold ${emp.cumplimiento_general<70?'text-red-500':'text-green-500'}`}>{emp.cumplimiento_general}%</span></div>))}</div>
            </div>
            {area.children && area.children.length > 0 && (<><div className="h-6 w-px bg-gray-400 -mt-4"></div><div className="flex gap-4 relative pt-4 border-t border-gray-400">{area.children.map(hijo => (<div key={hijo.id} className="flex flex-col items-center relative -mt-4 pt-4"><div className="h-4 w-px bg-gray-400 absolute top-0"></div><NodoOrganigrama area={hijo} /></div>))}</div></>)}
        </div>
    )
}
function TarjetaEmpleado({ emp, esLider, areas, allowEdit, funciones }: any) {
    const { asignarAreaEmpleado, actualizarIndicador, agregarIndicador, crearPlan, completarPlan, setExpandidoId, expandidoId, setNuevoIndicador, nuevoIndicador, textosPlanes, setTextosPlanes, diasPlanes, setDiasPlanes, calcularGantt, planChatAbierto, setPlanChatAbierto, enviarComentario, nuevoComentario, setNuevoComentario } = funciones;
    return (
        <div className={`bg-white rounded-xl shadow-sm border p-5 ${esLider ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">{emp.nombre} {esLider && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">LÍDER</span>}</h3>
                    <p className="text-xs text-gray-500">{emp.puesto}</p>
                    {allowEdit && <select className="mt-1 text-[10px] bg-gray-50 border rounded" value={emp.area_id || ""} onChange={(e) => asignarAreaEmpleado(emp.id, e.target.value)}><option value="">Sin Área</option>{areas.map((a:any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>}
                </div>
                <span className={`text-2xl font-bold ${emp.cumplimiento_general < 70 ? 'text-red-500' : 'text-blue-600'}`}>{emp.cumplimiento_general}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4"><div className={`h-1.5 rounded-full ${emp.cumplimiento_general < 70 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${emp.cumplimiento_general}%` }}></div></div>
            {/* Planes */}
            {emp.planes_mejora?.length > 0 && (<div className="mt-4 pt-3 border-t border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Planes</p><div className="space-y-4 max-h-60 overflow-y-auto pr-1 custom-scrollbar">{emp.planes_mejora.filter((p:any)=>allowEdit?true:p.estado!=='completado').map((plan:any) => {
                 const gantt = calcularGantt(plan.created_at, plan.fecha_limite);
                 return (<div key={plan.id} className="relative"><div className="flex justify-between items-center mb-1"><span className="text-xs font-medium text-gray-700 w-1/2 truncate">{plan.compromiso}</span><div className="flex gap-2"><button onClick={() => setPlanChatAbierto(planChatAbierto === plan.id ? null : plan.id)} className="text-[10px] bg-gray-100 px-1.5 rounded hover:bg-gray-200 flex items-center gap-1">💬 {plan.comentarios?.length || 0}</button>{allowEdit && <button onClick={() => completarPlan(plan.id, plan.estado)} className="text-[10px] text-green-600 bg-green-50 px-1.5 rounded border border-green-200">✔</button>}</div></div><div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border relative"><div className={`absolute top-0 left-0 h-full ${gantt.esVencido ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${gantt.porcentajeAvance}%` }}></div></div>{planChatAbierto === plan.id && (<div className="mt-2 bg-gray-50 p-2 rounded-lg border border-gray-200"><div className="max-h-24 overflow-y-auto space-y-2 mb-2">{plan.comentarios?.map((c:any) => <div key={c.id} className="text-[10px] bg-white p-1.5 rounded shadow-sm border border-gray-100"><span className="font-bold text-blue-800">{c.autor}: </span>{c.texto}</div>)}</div><div className="flex gap-1"><input className="flex-1 text-[10px] border rounded p-1" placeholder="..." value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)} /><button onClick={() => enviarComentario(plan.id)} className="bg-blue-600 text-white px-2 rounded text-[10px]">→</button></div></div>)}</div>)
            })}</div></div>)}
            {/* Crear Plan */}
            {allowEdit && emp.cumplimiento_general < 70 && (<div className="mt-3 flex gap-1"><input className="flex-1 text-xs border border-red-200 bg-red-50 p-1.5 rounded text-red-800" placeholder="Plan..." value={textosPlanes[emp.id] || ''} onChange={e => setTextosPlanes({ ...textosPlanes, [emp.id]: e.target.value })} /><button onClick={() => crearPlan(emp.id)} className="bg-red-500 text-white text-xs px-2 rounded font-bold">+</button></div>)}
            {/* Expandir */}
            <button onClick={() => setExpandidoId(expandidoId === emp.id ? null : emp.id)} className="mt-3 w-full text-center text-[10px] text-gray-400 py-1">{expandidoId === emp.id ? '▲ Ocultar KPIs' : '▼ Gestionar KPIs'}</button>
            {expandidoId === emp.id && (<div className="mt-2 pt-2 border-t bg-gray-50 -mx-5 -mb-5 px-5 pb-4 rounded-b-xl">{emp.indicadores?.map((ind:any) => (<div key={ind.id} className="mb-2"><div className="flex justify-between text-xs"><span>{ind.titulo}</span><span>{ind.progreso}%</span></div>{allowEdit && <input type="range" className="w-full h-1" value={ind.progreso} onChange={(e) => actualizarIndicador(ind.id, parseInt(e.target.value), emp.id)} />}</div>))}{allowEdit && <div className="flex gap-2 mt-2"><input className="flex-1 p-1 text-xs border rounded" placeholder="KPI..." value={nuevoIndicador} onChange={e => setNuevoIndicador(e.target.value)} /><button onClick={() => agregarIndicador(emp.id)} className="bg-gray-800 text-white px-2 rounded text-xs">+</button></div>}</div>)}
        </div>
    )
}