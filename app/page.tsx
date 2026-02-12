'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Definimos los tipos de datos
interface Empleado {
  id: number;
  nombre: string;
  puesto: string;
  email: string;
  cumplimiento_general: number;
}

interface Perfil {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export default function DashboardPerformance() {
  // Estados
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [miDesempeno, setMiDesempeno] = useState<Empleado | null>(null)
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  
  // Estados para formularios (Admin)
  const [nombre, setNombre] = useState('')
  const [puesto, setPuesto] = useState('')
  const [emailEmpleado, setEmailEmpleado] = useState('')
  const [planTexto, setPlanTexto] = useState<{ [key: number]: string }>({})
  
  const router = useRouter()

  useEffect(() => {
    verificarUsuario()
  }, [])

  async function verificarUsuario() {
    // 1. Verificar sesión
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { 
      router.push('/login')
      return 
    }

    // 2. Obtener el perfil desde Supabase
    const { data: perfilData, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.error("Error cargando perfil:", error)
    }

    // CHIVATO: Esto nos dirá en la consola quién eres
    console.log("Perfil cargado:", perfilData)

    setPerfil(perfilData)

    // 3. Cargar datos según el rol
    if (perfilData?.rol === 'admin') {
      obtenerTodosLosEmpleados()
    } else {
      // Si es empleado, usamos su email para buscar su ficha
      buscarMiDesempeno(session.user.email!)
    }
    setLoading(false)
  }

  async function obtenerTodosLosEmpleados() {
    const { data } = await supabase.from('empleados').select('*').order('id', { ascending: true })
    if (data) setEmpleados(data)
  }

  async function buscarMiDesempeno(email: string) {
    const { data } = await supabase
      .from('empleados')
      .select('*')
      .eq('email', email)
      .single()
    if (data) setMiDesempeno(data)
  }

  async function agregarEmpleado(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase
      .from('empleados')
      .insert([{ 
        nombre, 
        puesto, 
        email: emailEmpleado,
        cumplimiento_general: 0 
      }])
    
    if (!error) {
      setNombre(''); setPuesto(''); setEmailEmpleado('')
      obtenerTodosLosEmpleados()
      alert("Empleado creado exitosamente")
    } else {
      alert("Error al crear: " + error.message)
    }
  }

  async function guardarPlanMejora(empleadoId: number) {
    const texto = planTexto[empleadoId];
    if (!texto) return alert("Escribe un compromiso");
    
    const { error } = await supabase.from('planes_mejora').insert([{ 
      empleado_id: empleadoId, compromiso: texto 
    }]);
    
    if (!error) {
      alert("Plan registrado")
      setPlanTexto({ ...planTexto, [empleadoId]: "" })
    }
  }

  // --- RENDERIZADO ---

  if (loading) return <div className="p-10 text-center animate-pulse">Cargando sistema...</div>

  // VISTA 1: EMPLEADO (Solo ve su tarjeta)
  if (perfil?.rol !== 'admin') {
    return (
      <main className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">Hola, {perfil?.nombre || 'Colaborador'} 👋</h1>
                <button 
                  onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} 
                  className="text-red-500 text-sm hover:underline"
                >
                  Cerrar Sesión
                </button>
            </div>

            {miDesempeno ? (
                <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-blue-600">
                    <h2 className="text-gray-500 text-sm uppercase tracking-wide font-semibold">Tu Rendimiento</h2>
                    <div className="mt-4 flex justify-between items-end">
                        <div>
                            <h3 className="text-3xl font-bold text-gray-900">{miDesempeno.puesto}</h3>
                            <p className="text-gray-400 mt-1">Evaluado por: Dirección</p>
                        </div>
                        <span className="text-5xl font-bold text-blue-600">{miDesempeno.cumplimiento_general}%</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-6 mt-6 overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-1000 ${miDesempeno.cumplimiento_general < 70 ? 'bg-red-500' : 'bg-blue-600'}`} 
                            style={{ width: `${miDesempeno.cumplimiento_general}%` }}
                        ></div>
                    </div>
                </div>
            ) : (
                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200 text-center">
                    <p className="text-yellow-800">
                        Tu líder aún no ha configurado tu evaluación.
                        <br/><span className="text-sm font-bold">Tu ID registrado: {perfil?.email}</span>
                    </p>
                </div>
            )}
        </div>
      </main>
    )
  }

  // VISTA 2: ADMIN (Panel Completo)
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Panel de Liderazgo 🚀</h1>
          <div className="flex items-center gap-4">
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
              Modo Admin: {perfil?.nombre}
            </span>
            <button 
              onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} 
              className="text-gray-500 hover:text-red-600 text-sm"
            >
              Salir
            </button>
          </div>
        </div>
        
        {/* Formulario Admin */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-10">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Registrar Nuevo Colaborador</h2>
          <form onSubmit={agregarEmpleado} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input 
              className="p-2 border rounded-lg" 
              placeholder="Nombre" 
              value={nombre} 
              onChange={(e) => setNombre(e.target.value)} 
              required 
            />
            <input 
              className="p-2 border rounded-lg" 
              placeholder="Email Corporativo" 
              value={emailEmpleado} 
              onChange={(e) => setEmailEmpleado(e.target.value)} 
              required 
            />
            <input 
              className="p-2 border rounded-lg" 
              placeholder="Puesto" 
              value={puesto} 
              onChange={(e) => setPuesto(e.target.value)} 
              required 
            />
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Añadir
            </button>
          </form>
        </div>

        {/* Lista de Empleados */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {empleados.map((emp) => (
            <div key={emp.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">{emp.nombre}</h3>
                  <p className="text-gray-500 text-sm">{emp.email}</p>
                </div>
                <span className="text-2xl font-bold text-blue-600">{emp.cumplimiento_general}%</span>
              </div>
              
              <div className="mt-4 border-t pt-4">
                <input 
                  type="range" min="0" max="100" 
                  value={emp.cumplimiento_general}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  onChange={async (e) => {
                    const val = parseInt(e.target.value);
                    setEmpleados(empleados.map(e => e.id === emp.id ? {...e, cumplimiento_general: val} : e)) // Feedback visual rápido
                    await supabase.from('empleados').update({ cumplimiento_general: val }).eq('id', emp.id);
                  }}
                />
                
                {emp.cumplimiento_general < 70 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg animate-pulse">
                    <p className="text-xs font-bold text-red-700 mb-2 uppercase">⚠️ Plan Requerido</p>
                    <textarea 
                      className="w-full p-2 text-sm border rounded shadow-sm"
                      placeholder="Compromiso..."
                      value={planTexto[emp.id] || ""}
                      onChange={(e) => setPlanTexto({ ...planTexto, [emp.id]: e.target.value })}
                    />
                    <button 
                      onClick={() => guardarPlanMejora(emp.id)}
                      className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded w-full"
                    >
                      Guardar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}