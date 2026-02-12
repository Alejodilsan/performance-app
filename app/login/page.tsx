'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false) // Nuevo estado para feedback visual
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return alert("Por favor escribe correo y contraseña") // Validación

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      alert("Error: " + error.message)
    } else {
      router.push('/') // Si entra bien, lo manda al Dashboard
    }
  }

  const handleSignUp = async () => {
    if (!email || !password) return alert("Para registrarte necesitas escribir un correo y contraseña")

    setLoading(true)
    // Al registrarse, pasamos el nombre como "meta data"
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: 'Usuario Nuevo' } }
    })
    setLoading(false)

    if (error) {
      alert("Error: " + error.message)
    } else {
      alert('¡Usuario creado! Si no entraste automáticamente, inicia sesión.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Acceso Plataforma</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Correo corporativo"
            className="w-full p-2 border rounded text-gray-900"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full p-2 border rounded text-gray-900"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? "Cargando..." : "Iniciar Sesión"}
          </button>
        </form>

        <button 
          onClick={handleSignUp} 
          disabled={loading}
          className="w-full mt-4 text-sm text-gray-500 hover:underline"
        >
          ¿No tienes cuenta? Regístrate
        </button>
      </div>
    </div>
  )
}