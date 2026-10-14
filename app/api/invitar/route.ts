import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    // 1. Verificamos que las variables existan para no tumbar el servidor
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("FALTAN VARIABLES DE ENTORNO EN .env.local");
      return NextResponse.json({ mensaje: "Error de configuración de servidor." }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { empleados } = await request.json();
    let cuentasCreadas = 0;

    for (const emp of empleados) {
      if (!emp.email) continue;

      // Crea el usuario directamente con contraseña temporal
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: emp.email,
        password: 'Temporal123!', 
        email_confirm: true,
        user_metadata: {
          nombre: emp.nombre,
          rol: 'empleado',
          empresa_id: emp.empresa_id
        }
      });

      if (data.user) {
        // Aseguramos que exista en la tabla perfiles
        await supabaseAdmin.from('perfiles').upsert({
          id: data.user.id,
          nombre: emp.nombre,
          email: emp.email,
          rol: 'empleado',
          empresa_id: emp.empresa_id
        });
        cuentasCreadas++;
      } else if (error && error.status !== 422) {
         console.error(`Error con ${emp.email}:`, error.message);
      }
    }

    return NextResponse.json({ 
      mensaje: `✅ Se activaron ${cuentasCreadas} cuentas. Para pruebas, ya pueden entrar con la clave: Temporal123!` 
    });

  } catch (error: any) {
    console.error("Error catastrófico en API:", error);
    return NextResponse.json({ mensaje: `Error interno: ${error.message}` }, { status: 500 });
  }
}