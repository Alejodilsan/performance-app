import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  // 1. Conectamos con Supabase usando la LLAVE MAESTRA. 
  // Esto nos da poderes de Dios en la base de datos sin cerrar nuestra sesión.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { empleados } = await request.json();
    let creados = 0;
    let errores = 0;

    // 2. El Bot: Recorre la lista de Excel empleado por empleado
    for (const emp of empleados) {
      if (!emp.email) continue;

      // 3. Intenta crear la cuenta en la Bóveda con una clave falsa temporal
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: emp.email,
        password: 'Temporal123456!', 
        email_confirm: true // Le decimos que el correo ya es válido
      });

      // Si no hubo error (o si el error es que el usuario ya existía de antes)
      if (!error || error?.message.includes('already exists')) {
        // 4. ¡Magia! Le enviamos el enlace de recuperación usando la autopista Resend
        await supabaseAdmin.auth.resetPasswordForEmail(emp.email);
        creados++;
      } else {
        errores++;
      }
    }

    // 5. Le avisa a tu botón morado que ya terminó
    return NextResponse.json({ 
      mensaje: `Se enviaron ${creados} invitaciones por correo exitosamente.` 
    });

  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}