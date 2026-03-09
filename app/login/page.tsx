'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  // 1. LA MEMORIA DE LA PÁGINA (Estado)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' }) 
  const [vistaRecuperar, setVistaRecuperar] = useState(false) // Interruptor para cambiar la pantalla
  
  const router = useRouter()

  // 2. FUNCIÓN: INICIAR SESIÓN
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMensaje({ texto: '', tipo: '' })

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMensaje({ texto: 'Credenciales incorrectas. Verifica tu correo y clave.', tipo: 'error' })
      setLoading(false)
    } else {
      router.push('/') // Si todo sale bien, lo enviamos al Dashboard
    }
  }

  // 3. FUNCIÓN: RECUPERAR CLAVE
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setMensaje({ texto: 'Por favor, ingresa tu correo corporativo arriba.', tipo: 'error' })
      return
    }
    
    setLoading(true)
    setMensaje({ texto: '', tipo: '' })

    // Supabase envía el correo mágico
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/actualizar-clave`, // A dónde volverá al hacer clic en el correo
    })

    if (error) {
      setMensaje({ texto: 'Hubo un error al enviar el correo.', tipo: 'error' })
    } else {
      setMensaje({ texto: '¡Enlace enviado! Revisa tu bandeja de entrada (o SPAM).', tipo: 'exito' })
    }
    setLoading(false)
  }

  // 4. EL ESCENARIO (Lo que ve el usuario)
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md animate-in fade-in zoom-in-95">
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-2xl text-white">🏢</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800">
            {vistaRecuperar ? 'Recuperar Acceso' : 'Bienvenido de nuevo'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {vistaRecuperar ? 'Te enviaremos un enlace seguro' : 'Ingresa a tu plataforma de rendimiento'}
          </p>
        </div>

        {/* Cajas de Alerta (Éxito o Error) */}
        {mensaje.texto && (
          <div className={`p-4 rounded-lg mb-6 text-sm font-medium border ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {mensaje.tipo === 'error' ? '⚠️ ' : '✅ '} {mensaje.texto}
          </div>
        )}

        <form onSubmit={vistaRecuperar ? handleRecuperar : handleLogin} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Correo Corporativo</label>
            <input 
              type="email" 
              className="w-full mt-1 p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
              placeholder="ejemplo@pruebapp.com"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>

          {!vistaRecuperar && (
            <div>
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</label>
                <button type="button" onClick={() => {setVistaRecuperar(true); setMensaje({texto:'', tipo:''})}} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <input 
                type="password" 
                className="w-full mt-1 p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                placeholder="••••••••"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required={!vistaRecuperar} 
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg shadow-md hover:bg-slate-900 transition-colors disabled:bg-slate-400 mt-2"
          >
            {loading ? 'Procesando...' : (vistaRecuperar ? 'Enviar enlace mágico' : 'Iniciar Sesión')}
          </button>
        </form>

        {vistaRecuperar && (
          <div className="mt-6 text-center">
            <button onClick={() => {setVistaRecuperar(false); setMensaje({texto:'', tipo:''})}} className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
              ← Volver al inicio de sesión
            </button>
          </div>
        )}

      </div>
    </main>
  )
}