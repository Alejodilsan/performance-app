// Alta de una empresa nueva con su primer Admin.
//   npm run crear-empresa                       → pregunta los datos
//   npm run crear-empresa -- --empresa "Acme S.A.S." --nombre "Ana Pérez" --email ana@acme.com [--cargo "Directora de Talento"] [--moneda COP]
//   Opciones: --simular (solo valida, no escribe) · --si (no pide confirmación)
// Usa la service role de .env.local: córrelo solo desde un equipo de confianza. La clave temporal se muestra una sola vez.
import { createInterface } from 'node:readline/promises'
import { existsSync } from 'node:fs'
import { crearClienteAdmin } from '@/lib/servidor/supabaseAdmin'
import { altaEmpresa, verificarAlta } from '@/lib/servidor/altaEmpresa'
import { MONEDAS_SUGERIDAS, NIVELES_BASE, normalizarAlta, type DatosAltaEmpresa } from '@/lib/plataforma'

function argumentos() {
  const a = process.argv.slice(2);
  const valor = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : undefined; };
  return {
    datos: { empresa: valor('empresa'), adminNombre: valor('nombre'), adminEmail: valor('email'), adminCargo: valor('cargo'), moneda: valor('moneda') },
    simular: a.includes('--simular'),
    si: a.includes('--si'),
  };
}

async function main() {
  if (!existsSync('.env.local')) throw new Error('No se encontró .env.local: corre el comando desde la carpeta del proyecto.');
  process.loadEnvFile('.env.local');
  const { datos: crudos, simular, si } = argumentos();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Sin terminal interactiva (p. ej. todo por argumentos), los datos opcionales toman su valor por defecto
  const preguntar = async (texto: string, actual?: string, porDefecto?: string) =>
    actual ?? (porDefecto !== undefined && !process.stdin.isTTY ? porDefecto
      : ((await rl.question(`${texto}${porDefecto ? ` [${porDefecto}]` : ''}: `)).trim() || porDefecto || ''));

  try {
    console.log('\nAlta de empresa en AlemiaHR' + (simular ? ' (simulación: no se guarda nada)' : '') + '\n');
    const datos: DatosAltaEmpresa = normalizarAlta({
      empresa: await preguntar('Nombre de la empresa', crudos.empresa),
      adminNombre: await preguntar('Nombre completo del Admin', crudos.adminNombre),
      adminEmail: await preguntar('Correo del Admin', crudos.adminEmail),
      adminCargo: await preguntar('Cargo del Admin', crudos.adminCargo, 'Administrador de la plataforma'),
      moneda: await preguntar(`Moneda principal (${MONEDAS_SUGERIDAS.join(', ')})`, crudos.moneda, 'COP'),
    });

    const admin = crearClienteAdmin();
    const errores = await verificarAlta(admin, datos);
    if (errores.length) {
      console.error('\nNo se puede crear la empresa:\n' + errores.map(e => `  · ${e}`).join('\n'));
      process.exitCode = 1;
      return;
    }

    console.log(`\nSe creará:
  Empresa:   ${datos.empresa} (moneda ${datos.moneda})
  Admin:     ${datos.adminNombre} <${datos.adminEmail}> · ${datos.adminCargo}
  Además:    configuración inicial, ${NIVELES_BASE.length} niveles de cargo y la biblioteca 360 base`);
    if (simular) { console.log('\nSimulación correcta: los datos son válidos. Quita --simular para crearla.'); return; }
    if (!si && !/^s(i|í)?$/i.test((await rl.question('\n¿Crear? (s/N): ')).trim())) { console.log('Cancelado.'); return; }

    const r = await altaEmpresa(admin, datos);
    console.log(`
✅ Empresa creada (id ${r.empresaId})

  Comparte estos datos con el Admin por un canal seguro (la clave no se vuelve a mostrar):
    Correo:          ${datos.adminEmail}
    Clave temporal:  ${r.claveTemporal}
  Al entrar deberá crear su propia contraseña.

  Siguientes pasos para el Admin: configurar umbrales (Desempeño BI → ⚙️), cargar la estructura (📥 Importar)
  y dar acceso a su equipo (🔑 Dar Acceso).`);
    r.avisos.forEach(a => console.log(`\n⚠️  ${a}`));
  } finally {
    rl.close();
  }
}

main().catch(e => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
