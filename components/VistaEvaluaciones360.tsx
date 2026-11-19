'use client'
import type { Evaluacion, Empleado } from '@/lib/tipos'
import { FormEvaluacion } from './FormEvaluacion'

interface PropsVista360 {
  miDesempeno: Empleado | null;
  esLider: boolean;
  equipo: Empleado[];
  miLider: Empleado | undefined;
  evaluaciones: Evaluacion[];
  onSave: (evaluadoId: number, tipo: string, puntuacion: number, feedback: string) => Promise<void>;
}

// Vista de Evaluaciones (Se mantiene igual pero con clases más suaves)
export function VistaEvaluaciones360({ miDesempeno, esLider, equipo, miLider, evaluaciones, onSave }: PropsVista360) {
  if (!miDesempeno) return null;
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 w-full">
      <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl text-sm text-indigo-900 shadow-sm flex items-center gap-3">
        <span className="text-2xl">🔄</span><p><strong>Evaluación 360°:</strong> Refleja tu desempeño y el de tu entorno para crecer juntos. Sé sincero y constructivo.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormEvaluacion evaluado={miDesempeno} tipo="autoevaluacion" titulo="Mi Autoevaluación" descripcion="¿Cómo evalúas tu propio desempeño este periodo?" miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="purple" />
        {miLider && (<FormEvaluacion evaluado={miLider} tipo="ascendente" titulo={`Evaluación a mi Líder: ${miLider.nombre}`} descripcion="Evalúa el apoyo y gestión de tu jefe directo." miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="blue" />)}
      </div>
      {esLider && equipo.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold text-marca-900 mb-4 border-b border-slate-100 pb-2">Evaluación de mi Equipo (Descendente)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {equipo.map((miembro) => (<FormEvaluacion key={miembro.id} evaluado={miembro} tipo="descendente" titulo={`Evaluar a ${miembro.nombre}`} descripcion={miembro.puesto} miId={miDesempeno.id} evaluaciones={evaluaciones} onSave={onSave} colorTheme="emerald" />))}
          </div>
        </div>
      )}
    </div>
  )
}
