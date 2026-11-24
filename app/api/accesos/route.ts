import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { exigirAdmin, errorJson } from '@/lib/servidor/supabaseAdmin'
import { generarClaveTemporal } from '@/lib/servidor/claveTemporal'
import { rolDesdeTipoPerfil, type RolAcceso } from '@/lib/roles'
import type { Empleado, Perfil } from '@/lib/tipos'
import type { AccesoOtorgado, ErrorAcceso } from '@/lib/accesos'
import { mensajeDeError } from '@/lib/errores'

/**
 * Gestión de accesos a la plataforma (solo Admin de la misma empresa).
 *
 * POST { accion: 'otorgar', empleadoIds: number[], metodo?: 'clave_temporal' }
 *      Crea la cuenta (o restablece la clave si ya existe) y devuelve las claves temporales UNA sola vez.
 * POST { accion: 'sincronizar_rol', empleadoId }   → perfiles.rol = rol según empleados.tipo_perfil
 * POST { accion: 'revocar',         empleadoId }   → bloquea el inicio de sesión (al desvincular)
 * POST { accion: 'restaurar',       empleadoId }   → desbloquea el inicio de sesión (al reactivar)
 */

// Formas de dar acceso. Hoy solo clave temporal; a futuro: 'correo' (invitación por email vía SMTP).
type MetodoAcceso = 'clave_temporal';
const METODOS_DISPONIBLES: MetodoAcceso[] = ['clave_temporal'];

const BLOQUEO_INDEFINIDO = '876000h'; // ~100 años

type EmpleadoDB = Pick<Empleado, 'id' | 'nombre' | 'email' | 'tipo_perfil' | 'estado_contratacion'> & { user_id: string | null; empresa_id: number };


export async function POST(request: Request) {
  const auth = await exigirAdmin(request);
  if (!auth.ok) return auth.respuesta;
  const { admin, usuario, perfil } = auth;

  let body: { accion?: string; empleadoIds?: unknown; empleadoId?: unknown; metodo?: MetodoAcceso };
  try { body = await request.json(); } catch { return errorJson('Solicitud inválida.', 400); }

  try {
    switch (body?.accion) {
      case 'otorgar': {
        const metodo: MetodoAcceso = body.metodo ?? 'clave_temporal';
        if (!METODOS_DISPONIBLES.includes(metodo)) return errorJson(`Método de acceso no disponible: ${metodo}`, 400);
        const ids: number[] = Array.isArray(body.empleadoIds) ? body.empleadoIds.map(Number).filter(Number.isFinite) : [];
        if (ids.length === 0) return errorJson('No se indicaron colaboradores.', 400);
        if (ids.length > 500) return errorJson('Máximo 500 colaboradores por solicitud.', 400);
        return NextResponse.json(await otorgarAccesos(admin, usuario, perfil, ids));
      }
      case 'sincronizar_rol':
      case 'revocar':
      case 'restaurar': {
        const emp = await empleadoDeLaEmpresa(admin, perfil.empresa_id, Number(body.empleadoId));
        if (!emp) return errorJson('Colaborador no encontrado.', 404);
        if (!emp.user_id) return NextResponse.json({ ok: true, mensaje: 'El colaborador aún no tiene cuenta de acceso.' });
        if (emp.user_id === usuario.id) return errorJson('No puedes cambiar tu propio acceso o rol.', 400);

        if (body.accion === 'sincronizar_rol') {
          const rol = rolDesdeTipoPerfil(emp.tipo_perfil);
          const bloqueo = await verificarNoEsUltimoAdmin(admin, perfil.empresa_id, emp.user_id, rol);
          if (bloqueo) return errorJson(bloqueo, 409);
          const { error } = await admin.from('perfiles').update({ rol }).eq('id', emp.user_id).eq('empresa_id', perfil.empresa_id);
          if (error) throw error;
          return NextResponse.json({ ok: true, rol });
        }

        if (body.accion === 'revocar') {
          const bloqueo = await verificarNoEsUltimoAdmin(admin, perfil.empresa_id, emp.user_id, 'empleado');
          if (bloqueo) return errorJson(bloqueo, 409);
        }
        const { error } = await admin.auth.admin.updateUserById(emp.user_id, {
          ban_duration: body.accion === 'revocar' ? BLOQUEO_INDEFINIDO : 'none',
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      default:
        return errorJson('Acción no válida.', 400);
    }
  } catch (error) {
    console.error('Error en /api/accesos:', error);
    return errorJson(`Error interno: ${mensajeDeError(error)}`, 500);
  }
}

// ------------------------------------------------------------------

async function empleadoDeLaEmpresa(admin: SupabaseClient, empresaId: number, id: number): Promise<EmpleadoDB | null> {
  if (!Number.isFinite(id)) return null;
  const { data } = await admin.from('empleados')
    .select('id, nombre, email, tipo_perfil, estado_contratacion, user_id, empresa_id')
    .eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  return data;
}

/** Evita que la empresa se quede sin ningún administrador. Devuelve el mensaje de error o null. */
async function verificarNoEsUltimoAdmin(admin: SupabaseClient, empresaId: number, userId: string, nuevoRol: RolAcceso): Promise<string | null> {
  if (nuevoRol === 'admin') return null;
  const { data: actual } = await admin.from('perfiles').select('rol').eq('id', userId).maybeSingle();
  if (actual?.rol !== 'admin') return null;
  const { count } = await admin.from('perfiles').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('rol', 'admin').neq('id', userId);
  return (count ?? 0) === 0 ? 'No se puede quitar el rol de administrador: es el único Admin de la organización.' : null;
}

/** Busca una cuenta existente por correo (perfiles primero; si no, en Auth). */
async function buscarCuentaPorEmail(admin: SupabaseClient, email: string): Promise<{ id: string; empresaId: number | null; enPerfiles: boolean } | null> {
  const { data: perfilExistente } = await admin.from('perfiles').select('id, empresa_id').ilike('email', email).maybeSingle();
  if (perfilExistente) return { id: perfilExistente.id, empresaId: perfilExistente.empresa_id, enPerfiles: true };

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const encontrado = data.users.find(u => u.email?.toLowerCase() === email);
    if (encontrado) {
      const empresaId = Number(encontrado.app_metadata?.empresa_id ?? encontrado.user_metadata?.empresa_id);
      return { id: encontrado.id, empresaId: Number.isFinite(empresaId) ? empresaId : null, enPerfiles: false };
    }
    if (data.users.length < 1000) break;
  }
  return null;
}

async function otorgarAccesos(admin: SupabaseClient, usuario: User, perfil: Perfil, ids: number[]) {
  const { data: empleadosDB, error } = await admin.from('empleados')
    .select('id, nombre, email, tipo_perfil, estado_contratacion, user_id, empresa_id')
    .in('id', ids).eq('empresa_id', perfil.empresa_id);
  if (error) throw error;

  const otorgados: AccesoOtorgado[] = [];
  const errores: ErrorAcceso[] = [];
  const noEncontrados = ids.filter(id => !(empleadosDB || []).some(e => e.id === id));
  noEncontrados.forEach(id => errores.push({ empleado_id: id, nombre: `#${id}`, mensaje: 'No pertenece a tu organización.' }));

  for (const emp of (empleadosDB || []) as EmpleadoDB[]) {
    const fallo = (mensaje: string) => errores.push({ empleado_id: emp.id, nombre: emp.nombre, mensaje });
    const email = emp.email?.trim().toLowerCase();

    if (!email) { fallo('No tiene correo registrado.'); continue; }
    if (emp.estado_contratacion === 'desvinculado') { fallo('Está desvinculado; reactívalo primero.'); continue; }
    if (emp.user_id === usuario.id || email === usuario.email?.toLowerCase()) { fallo('Es tu propia cuenta: cambia tu clave desde tu perfil.'); continue; }

    try {
      const rol = rolDesdeTipoPerfil(emp.tipo_perfil);
      const clave = generarClaveTemporal();
      const appMetadata = { debe_cambiar_clave: true, empresa_id: perfil.empresa_id };

      // ¿Ya tiene cuenta? (vinculada, o creada antes con el mismo correo)
      let userId = emp.user_id;
      if (!userId) {
        const existente = await buscarCuentaPorEmail(admin, email);
        if (existente) {
          if (existente.empresaId !== null && existente.empresaId !== perfil.empresa_id) {
            fallo('Ese correo ya tiene una cuenta en otra organización.');
            continue;
          }
          if (existente.enPerfiles) userId = existente.id;
          else {
            // Cuenta sin perfil (p. ej. creada por registro público o un intento anterior que falló): no se adopta,
            // porque quien la creó podría tener una sesión abierta. Se elimina y se crea una nueva más abajo.
            const { error: errBorrar } = await admin.auth.admin.deleteUser(existente.id);
            if (errBorrar) { fallo(`Existe una cuenta previa con ese correo que no se pudo reemplazar: ${errBorrar.message}`); continue; }
          }
        }
      }

      let cuentaNueva = false;
      if (userId) {
        const bloqueo = await verificarNoEsUltimoAdmin(admin, perfil.empresa_id, userId, rol);
        if (bloqueo) { fallo(bloqueo); continue; }
        const { error: errUpd } = await admin.auth.admin.updateUserById(userId, { password: clave, app_metadata: appMetadata, ban_duration: 'none' });
        if (errUpd) { fallo(errUpd.message); continue; }
      } else {
        const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
          email, password: clave, email_confirm: true,
          app_metadata: appMetadata,
          user_metadata: { nombre: emp.nombre },
        });
        if (errCrear || !creado.user) { fallo(errCrear?.message || 'No se pudo crear la cuenta.'); continue; }
        userId = creado.user.id;
        cuentaNueva = true;
      }

      const { error: errPerfil } = await admin.from('perfiles').upsert({
        id: userId, nombre: emp.nombre, email, rol, empresa_id: perfil.empresa_id,
      });
      if (errPerfil) { fallo(`Cuenta creada, pero falló el perfil: ${errPerfil.message}`); continue; }

      const { error: errEmp } = await admin.from('empleados').update({
        user_id: userId, estado_acceso: 'invitado', fecha_invitacion: new Date().toISOString(), fecha_activacion: null,
      }).eq('id', emp.id);
      if (errEmp) { fallo(`Cuenta creada, pero no se pudo registrar el estado: ${errEmp.message}`); continue; }

      otorgados.push({ empleado_id: emp.id, nombre: emp.nombre, email, clave_temporal: clave, cuenta_nueva: cuentaNueva });
    } catch (e) {
      fallo(mensajeDeError(e, 'Error inesperado.'));
    }
  }

  return { otorgados, errores };
}
