import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { empleados } = await request.json();
    let creados = 0;
    let errores: string[] = [];

    for (const emp of empleados) {
      if (!emp.email) continue;

      // Genera el link de invitación oficial de Supabase
      // Tipo "invite" muestra pantalla de crear contraseña, no resetear
      const { data: linkData, error: errorLink } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: emp.email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`
        }
      });

      if (errorLink || !linkData) {
        errores.push(`${emp.email}: no se pudo generar el link — ${errorLink?.message}`);
        continue;
      }

      // Envía el email con el link usando Resend
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
          to: emp.email,
          subject: '¡Te invitaron a la plataforma de desempeño!',
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
              <div style="background: #1e293b; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px;">🏢</span>
                <h1 style="color: white; margin: 8px 0 0 0; font-size: 20px;">Plataforma de Desempeño</h1>
              </div>
              <h2 style="color: #1e293b;">Hola, ${emp.nombre} 👋</h2>
              <p style="color: #475569; line-height: 1.6;">
                Tu empresa te ha dado acceso a la plataforma de gestión de desempeño.
                Haz clic en el botón para crear tu contraseña y empezar.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${linkData.properties.action_link}"
                  style="background: #2563eb; color: white; padding: 14px 32px;
                         border-radius: 8px; text-decoration: none; font-weight: bold;
                         font-size: 16px; display: inline-block;">
                  Activar mi cuenta →
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                Este enlace expira en 24 horas.<br/>
                Si no esperabas este correo, puedes ignorarlo.
              </p>
            </div>
          `
        })
      });

      if (!resendRes.ok) {
        const resendError = await resendRes.json();
        errores.push(`${emp.email}: error enviando email — ${resendError?.message}`);
        continue;
      }

      creados++;
    }

    return NextResponse.json({
      mensaje: `✅ ${creados} invitaciones enviadas.${errores.length > 0 ? `\n⚠️ ${errores.length} errores:\n${errores.join('\n')}` : ''}`
    });

  } catch (error: any) {
    console.error('Error en /api/invitar:', error);
    return NextResponse.json(
      { mensaje: `Error interno: ${error?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }
}