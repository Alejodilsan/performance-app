// ⚠️ Solo servidor / scripts. Alta de una empresa nueva con su primer Admin, en un solo paso y con reversión.
// La usa `npm run crear-empresa` (scripts/crear-empresa.ts); está separada para reutilizarla en una futura consola de plataforma.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NIVELES_BASE, validarAlta, type DatosAltaEmpresa } from '@/lib/plataforma'
import { generarClaveTemporal } from './claveTemporal'
import { sembrarBiblioteca360 } from './evaluacion360'

export interface ResultadoAlta {
  empresaId: number;
  userId: string;
  empleadoId: number;
  claveTemporal: string;
  /** Pasos opcionales que no se pudieron completar (no impiden usar la plataforma) */
  avisos: string[];
}

/** Busca una cuenta de acceso con ese correo (en perfiles o en Supabase Auth). */
async function cuentaConCorreo(admin: SupabaseClient, email: string): Promise<{ id: string; enPerfiles: boolean; empresaId: number | null } | null> {
  const { data: perfil } = await admin.from('perfiles').select('id, empresa_id').ilike('email', email).maybeSingle();
  if (perfil) return { id: perfil.id, enPerfiles: true, empresaId: perfil.empresa_id };
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find(x => x.email?.toLowerCase() === email);
    if (u) return { id: u.id, enPerfiles: false, empresaId: null };
    if (data.users.length < 1000) break;
  }
  return null;
}

/** Comprueba los datos contra la base (nombre de empresa libre, correo sin cuenta). No escribe nada. */
export async function verificarAlta(admin: SupabaseClient, datos: DatosAltaEmpresa): Promise<string[]> {
  const { data: empresas, error } = await admin.from('empresas').select('nombre');
  if (error) throw error;
  const errores = validarAlta(datos, (empresas || []).map(e => e.nombre));
  if (errores.some(e => e.includes('correo'))) return errores;
  const cuenta = await cuentaConCorreo(admin, datos.adminEmail);
  if (cuenta?.enPerfiles) {
    errores.push(`El correo ${datos.adminEmail} ya tiene acceso a otra empresa (id ${cuenta.empresaId}). Un correo solo puede pertenecer a una empresa.`);
  } else if (cuenta) {
    errores.push(`Ya existe una cuenta de acceso con ${datos.adminEmail} sin empresa asignada (p. ej. creada por registro público). ` +
      'Por seguridad no se reutiliza: elimínala en Supabase → Authentication → Users y vuelve a intentarlo.');
  }
  return errores;
}

/**
 * Crea: empresa → configuración (moneda) → niveles de cargo base → biblioteca 360 base → cuenta del Admin con clave
 * temporal (cambio obligatorio al entrar) → perfil Admin → ficha de colaborador. Si un paso obligatorio falla,
 * deshace lo creado (en orden inverso) y lanza el error.
 */
export async function altaEmpresa(admin: SupabaseClient, datos: DatosAltaEmpresa): Promise<ResultadoAlta> {
  const errores = await verificarAlta(admin, datos);
  if (errores.length) throw new Error(errores.join('\n'));

  const deshacer: { paso: string; f: () => PromiseLike<unknown> }[] = [];
  const avisos: string[] = [];
  const ok = <T>(r: { data: T; error: { message: string } | null }, paso: string): T => {
    if (r.error) throw new Error(`${paso}: ${r.error.message}`);
    return r.data;
  };

  try {
    const empresa = ok(await admin.from('empresas').insert({ nombre: datos.empresa }).select('id').single(), 'Crear la empresa');
    const empresaId = empresa!.id as number;
    deshacer.push({ paso: 'empresa', f: () => admin.from('empresas').delete().eq('id', empresaId) });

    ok(await admin.from('configuracion_empresa').insert({ empresa_id: empresaId, moneda_principal: datos.moneda }), 'Configuración inicial');
    deshacer.push({ paso: 'configuración', f: () => admin.from('configuracion_empresa').delete().eq('empresa_id', empresaId) });

    ok(await admin.from('niveles_cargo').insert(NIVELES_BASE.map((nombre, i) => ({ nombre, empresa_id: empresaId, orden: i + 1 }))), 'Niveles de cargo');
    deshacer.push({ paso: 'niveles de cargo', f: () => admin.from('niveles_cargo').delete().eq('empresa_id', empresaId) });

    // Opcional: si la 360 no está disponible, la empresa igual queda operativa (el Admin la carga después)
    deshacer.push({ paso: 'biblioteca 360', f: () => admin.from('ev360_competencias').delete().eq('empresa_id', empresaId) });
    try { await sembrarBiblioteca360(admin, empresaId); }
    catch (e) {
      await admin.from('ev360_competencias').delete().eq('empresa_id', empresaId);
      avisos.push(`No se cargó la biblioteca 360 base (${e instanceof Error ? e.message : e}). El Admin puede cargarla desde Evaluaciones 360 → Administrar.`);
    }

    const claveTemporal = generarClaveTemporal();
    const { data: creado, error: errCuenta } = await admin.auth.admin.createUser({
      email: datos.adminEmail, password: claveTemporal, email_confirm: true,
      app_metadata: { debe_cambiar_clave: true, empresa_id: empresaId },
      user_metadata: { nombre: datos.adminNombre },
    });
    if (errCuenta || !creado.user) throw new Error(`Crear la cuenta del Admin: ${errCuenta?.message ?? 'sin respuesta'}`);
    const userId = creado.user.id;
    deshacer.push({ paso: 'cuenta', f: () => admin.auth.admin.deleteUser(userId) });

    ok(await admin.from('perfiles').insert({ id: userId, email: datos.adminEmail, nombre: datos.adminNombre, rol: 'admin', empresa_id: empresaId }), 'Perfil Admin');
    deshacer.push({ paso: 'perfil', f: () => admin.from('perfiles').delete().eq('id', userId) });

    const empleado = ok(await admin.from('empleados').insert({
      nombre: datos.adminNombre, email: datos.adminEmail, puesto: datos.adminCargo, tipo_perfil: 'Admin', empresa_id: empresaId,
      user_id: userId, estado_contratacion: 'activo', estado_acceso: 'invitado', fecha_invitacion: new Date().toISOString(),
    }).select('id').single(), 'Ficha del Admin');
    const empleadoId = empleado!.id as number;

    return { empresaId, userId, empleadoId, claveTemporal, avisos };
  } catch (e) {
    const fallidos: string[] = [];
    for (const d of deshacer.reverse()) {
      try { const r = await d.f() as { error?: { message: string } | null }; if (r?.error) fallidos.push(`${d.paso}: ${r.error.message}`); }
      catch (x) { fallidos.push(`${d.paso}: ${x instanceof Error ? x.message : x}`); }
    }
    const detalle = fallidos.length ? `\nNo se pudo deshacer: ${fallidos.join('; ')}. Revísalo en Supabase.` : '\nSe deshicieron los pasos ya creados.';
    throw new Error((e instanceof Error ? e.message : String(e)) + detalle);
  }
}
