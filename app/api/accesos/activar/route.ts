import { NextResponse } from 'next/server'
import { crearClienteAdmin, usuarioDesdeRequest, errorJson } from '@/lib/servidor/supabaseAdmin'
import { mensajeDeError } from '@/lib/errores'

/**
 * Lo llama el propio colaborador justo después de reemplazar su clave temporal.
 * Quita la marca "debe cambiar clave" y deja su acceso como 'activo'.
 */
export async function POST(request: Request) {
  try {
    const admin = crearClienteAdmin();
    const usuario = await usuarioDesdeRequest(request, admin);
    if (!usuario) return errorJson('Sesión no válida.', 401);

    const { error } = await admin.auth.admin.updateUserById(usuario.id, {
      app_metadata: { debe_cambiar_clave: false },
    });
    if (error) throw error;

    const ahora = new Date().toISOString();
    const { data: vinculados } = await admin.from('empleados')
      .update({ estado_acceso: 'activo', fecha_activacion: ahora })
      .eq('user_id', usuario.id)
      .select('id');

    // Cuentas antiguas aún no vinculadas: se vinculan por correo dentro de su empresa
    if ((!vinculados || vinculados.length === 0) && usuario.email) {
      const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('id', usuario.id).maybeSingle();
      if (perfil?.empresa_id) {
        await admin.from('empleados')
          .update({ user_id: usuario.id, estado_acceso: 'activo', fecha_activacion: ahora })
          .ilike('email', usuario.email).eq('empresa_id', perfil.empresa_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error en /api/accesos/activar:', error);
    return errorJson(`Error interno: ${mensajeDeError(error)}`, 500);
  }
}
