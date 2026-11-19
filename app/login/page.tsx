'use client'
import { MarcoAcceso } from '@/components/marca/MarcoAcceso'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { debeCambiarClave } from '@/lib/accesos'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })
  const [vistaRecuperar, setVistaRecuperar] = useState(false)
  // Nuevo: detecta si el usuario viene de un link de invitación
  const [vistaCrearClave, setVistaCrearClave] = useState(false)

  const router = useRouter()

  useEffect(() => {
  // Caso 1: Token en el hash (#access_token=...) — flujo implícito
  const hash = window.location.hash
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1))
    const type = params.get('type')
    if (type === 'invite' || type === 'recovery') {
      setVistaCrearClave(true)
      return
    }
  }

  // Caso 2: Token en query params (?code=...) — flujo PKCE
  const searchParams = new URLSearchParams(window.location.search)
  const code = searchParams.get('code')
  if (code) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setVistaCrearClave(true)
      }
    })
  }
}, [])

  // LOGIN normal
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMensaje({ texto: '', tipo: '' })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Una cuenta bloqueada (colaborador desvinculado) también llega aquí
      const bloqueada = /banned/i.test(error.message)
      setMensaje({
        texto: bloqueada
          ? 'Tu acceso está deshabilitado. Si crees que es un error, contacta a RRHH.'
          : 'Credenciales incorrectas. Verifica tu correo y clave.',
        tipo: 'error'
      })
      setLoading(false)
    } else if (debeCambiarClave(data.user?.app_metadata)) {
      // Entró con su clave temporal: primero debe crear su propia contraseña
      router.push('/actualizar-clave')
    } else {
      router.push('/')
    }
  }

  // RECUPERAR CLAVE (olvidé mi contraseña)
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setMensaje({ texto: 'Por favor, ingresa tu correo corporativo.', tipo: 'error' })
      return
    }
    setLoading(true)
    setMensaje({ texto: '', tipo: '' })
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) {
      setMensaje({ texto: 'Hubo un error al enviar el correo.', tipo: 'error' })
    } else {
      setMensaje({ texto: '¡Enlace enviado! Revisa tu bandeja (o SPAM).', tipo: 'exito' })
    }
    setLoading(false)
  }

  // CREAR/ACTUALIZAR CONTRASEÑA (viene de invitación o recovery)
  const handleCrearClave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== passwordConfirm) {
      setMensaje({ texto: 'Las contraseñas no coinciden.', tipo: 'error' })
      return
    }
    if (password.length < 8) {
      setMensaje({ texto: 'La contraseña debe tener al menos 8 caracteres.', tipo: 'error' })
      return
    }
    setLoading(true)
    setMensaje({ texto: '', tipo: '' })

    // Supabase ya tiene la sesión activa gracias al token del link
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMensaje({ texto: `Error al crear la contraseña: ${error.message}`, tipo: 'error' })
      setLoading(false)
    } else {
      setMensaje({ texto: '¡Contraseña creada! Redirigiendo...', tipo: 'exito' })
      setTimeout(() => router.push('/'), 1500)
    }
  }

  // PANTALLA: Crear contraseña (viene de invitación o recovery link)
  if (vistaCrearClave) {
    return (
      <MarcoAcceso>
          <div className="mb-7">
            <h1 className="text-2xl font-extrabold text-marca-900">Crea tu contraseña</h1>
            <p className="text-sm text-slate-500 mt-2">Elige una contraseña segura para acceder a tu cuenta</p>
          </div>

          {mensaje.texto && (
            <div className={`p-4 rounded-lg mb-6 text-sm font-medium border ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-acento-50 text-acento-800 border-acento-200'}`}>
              {mensaje.tipo === 'error' ? '⚠️ ' : '✅ '}{mensaje.texto}
            </div>
          )}

          <form onSubmit={handleCrearClave} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Nueva contraseña</label>
              <input
                type="password"
                className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Confirmar contraseña</label>
              <input
                type="password"
                className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm"
                placeholder="Repite tu contraseña"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-acento-600 text-white font-bold py-3 rounded-xl shadow-md shadow-acento-600/20 hover:bg-acento-700 transition-colors disabled:bg-slate-400 mt-2"
            >
              {loading ? 'Guardando...' : 'Crear contraseña e ingresar →'}
            </button>
          </form>
        </MarcoAcceso>
    )
  }

  // PANTALLA: Login normal / Recuperar clave
  return (
    <MarcoAcceso>

        <div className="mb-7">
          <h1 className="text-2xl font-extrabold text-marca-900">
            {vistaRecuperar ? 'Recuperar Acceso' : 'Bienvenido de nuevo'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {vistaRecuperar ? 'Te enviaremos un enlace seguro' : 'Ingresa a tu plataforma de rendimiento'}
          </p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-lg mb-6 text-sm font-medium border ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-acento-50 text-acento-800 border-acento-200'}`}>
            {mensaje.tipo === 'error' ? '⚠️ ' : '✅ '}{mensaje.texto}
          </div>
        )}

        <form onSubmit={vistaRecuperar ? handleRecuperar : handleLogin} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Correo Corporativo</label>
            <input
              type="email"
              className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm"
              placeholder="ejemplo@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          {!vistaRecuperar && (
            <div>
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-marca-500 uppercase tracking-wider">Contraseña</label>
                <button type="button" onClick={() => { setVistaRecuperar(true); setMensaje({ texto: '', tipo: '' }) }} className="text-xs font-bold text-acento-700 hover:text-acento-800">
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <input
                type="password"
                className="w-full mt-1 p-3 border border-marca-100 bg-marca-50/40 rounded-xl outline-none focus:border-acento-500 focus:ring-2 focus:ring-acento-100 transition-all text-sm"
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
            className="w-full bg-acento-600 text-white font-bold py-3 rounded-xl shadow-md shadow-acento-600/20 hover:bg-acento-700 transition-colors disabled:bg-slate-400 mt-2"
          >
            {loading ? 'Procesando...' : (vistaRecuperar ? 'Enviar enlace mágico' : 'Iniciar Sesión')}
          </button>
        </form>

        {vistaRecuperar && (
          <div className="mt-6 text-center">
            <button onClick={() => { setVistaRecuperar(false); setMensaje({ texto: '', tipo: '' }) }} className="text-sm font-bold text-slate-500 hover:text-marca-900 transition-colors">
              ← Volver al inicio de sesión
            </button>
          </div>
        )}
      </MarcoAcceso>
  )
}