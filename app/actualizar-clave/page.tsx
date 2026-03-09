'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ActualizarClave() {
  // 1. LA MEMORIA DE LA PÁGINA
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })
  
  const router = useRouter()

  // 2. FUNCIÓN: GUARDAR NUEVA CLAVE
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Pequeñas validaciones de seguridad antes de enviar a Supabase
    if (password !== confirmPassword) {
      setMensaje({ texto: 'Las contraseñas no coinciden. Intenta de nuevo.', tipo: 'error' })
      return
    }
    if (password.length < 6) {
      setMensaje({ texto: 'La contraseña debe tener al menos 6 caracteres.', tipo: 'error' })
      return
    }

    setLoading(true)
    setMensaje({ texto: '', tipo: '' })

    // Supabase actualiza la clave del usuario que hizo clic en el enlace
    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setMensaje({ texto: 'Hubo un error. Es posible que el enlace haya expirado.', tipo: 'error' })
    } else {
      setMensaje({ texto: '¡Clave actualizada con éxito! Redirigiendo...', tipo: 'exito' })
      // Esperamos 2 segundos para que lea el mensaje de éxito y lo mandamos al Login
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
    
    setLoading(false)
  }

  // 3. EL ESCENARIO
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md animate-in fade-in zoom-in-95">
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-emerald-200">
            <span className="text-2xl text-white">🔒</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800">Crea tu nueva clave</h1>
          <p className="text-sm text-slate-500 mt-2">Ingresa una contraseña segura para tu cuenta</p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-lg mb-6 text-sm font-medium border ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {mensaje.tipo === 'error' ? '⚠️ ' : '✅ '} {mensaje.texto}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva Contraseña</label>
            <input 
              type="password" 
              className="w-full mt-1 p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
              placeholder="Mínimo 6 caracteres"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirmar Contraseña</label>
            <input 
              type="password" 
              className="w-full mt-1 p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
              placeholder="Repite tu nueva contraseña"
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg shadow-md hover:bg-slate-900 transition-colors disabled:bg-slate-400 mt-2"
          >
            {loading ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>

      </div>
    </main>
  )
}