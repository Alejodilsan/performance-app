'use client'
import { MarcoAcceso } from '@/components/marca/MarcoAcceso'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { activarMiCuenta, debeCambiarClave } from '@/lib/accesos'
import { mensajeDeError } from '@/lib/errores'

const LARGO_MINIMO = 8

export default function ActualizarClave() {
  // 1. LA MEMORIA DE LA PÁGINA
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })
  // Primer ingreso con clave temporal (vs. cambio de clave desde un enlace de recuperación)
  const [primerIngreso, setPrimerIngreso] = useState(false)

  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setPrimerIngreso(debeCambiarClave(session.user.app_metadata))
    })
  }, [router])

  // 2. FUNCIÓN: GUARDAR NUEVA CLAVE
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Pequeñas validaciones de seguridad antes de enviar a Supabase
    if (password !== confirmPassword) {
      setMensaje({ texto: 'Las contraseñas no coinciden. Intenta de nuevo.', tipo: 'error' })
      return
    }
    if (password.length < LARGO_MINIMO) {
      setMensaje({ texto: `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`, tipo: 'error' })
      return
    }

    setLoading(true)
    setMensaje({ texto: '', tipo: '' })

    // Supabase actualiza la clave del usuario con sesión activa
    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      const igualALaAnterior = /different from the old password|same/i.test(error.message)
      setMensaje({
        texto: igualALaAnterior
          ? 'La nueva contraseña debe ser distinta a la clave temporal.'
          : primerIngreso ? `No se pudo guardar la contraseña: ${error.message}` : 'Hubo un error. Es posible que el enlace haya expirado.',
        tipo: 'error'
      })
      setLoading(false)
      return
    }

    if (primerIngreso) {
      // Marca la cuenta como activa y refresca la sesión para que deje de exigir el cambio de clave
      try {
        await activarMiCuenta()
        await supabase.auth.refreshSession()
      } catch (e) {
        setMensaje({ texto: `Tu contraseña se guardó, pero no pudimos activar tu cuenta: ${mensajeDeError(e)}. Intenta entrar de nuevo.`, tipo: 'error' })
        setLoading(false)
        return
      }
      setMensaje({ texto: '¡Listo! Tu cuenta está activa. Entrando...', tipo: 'exito' })
      setTimeout(() => router.push('/'), 1200)
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
    <MarcoAcceso>
        
        <div className="mb-7">
          <h1 className="text-2xl font-extrabold text-marca-900">{primerIngreso ? '¡Bienvenido! Crea tu contraseña' : 'Crea tu nueva clave'}</h1>
          <p className="text-sm text-slate-500 mt-2">
            {primerIngreso
              ? 'Entraste con una clave temporal. Elige tu propia contraseña para activar tu cuenta.'
              : 'Ingresa una contraseña segura para tu cuenta'}
          </p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-lg mb-6 text-sm font-medium border ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-acento-50 text-acento-800 border-acento-200'}`}>
            {mensaje.tipo === 'error' ? '⚠️ ' : '✅ '} {mensaje.texto}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Nueva Contraseña</label>
            <input 
              type="password" 
              className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm" 
              placeholder={`Mínimo ${LARGO_MINIMO} caracteres`}
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Confirmar Contraseña</label>
            <input 
              type="password" 
              className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm" 
              placeholder="Repite tu nueva contraseña"
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-acento-600 text-white font-bold py-3 rounded-xl shadow-md shadow-acento-600/20 hover:bg-acento-700 transition-colors disabled:bg-slate-400 mt-2"
          >
            {loading ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>

      </MarcoAcceso>
  )
}