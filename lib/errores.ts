/** Mensaje legible de cualquier error capturado (Error, error de Supabase o valor desconocido). */
export function mensajeDeError(e: unknown, porDefecto = 'Error desconocido'): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return porDefecto;
}
