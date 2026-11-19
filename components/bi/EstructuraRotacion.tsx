'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { JORNADAS, MODALIDADES, TIPOS_CONTRATO, type Empleado } from '@/lib/tipos'
import { ORDEN_ANTIGUEDAD, contarPor, rangoAntiguedad, type Rotacion } from '@/lib/bi'

interface Props {
  empleados: Empleado[];
  rotacion: Rotacion;
}

/** Composición de la plantilla y salidas de los últimos 12 meses. */
export function EstructuraRotacion({ empleados, rotacion }: Props) {
  const total = empleados.length;
  const grupos = [
    { titulo: 'Tipo de contrato', filas: contarPor(empleados, e => (e.tipo_contrato && TIPOS_CONTRATO[e.tipo_contrato]) || 'Sin definir') },
    { titulo: 'Modalidad', filas: contarPor(empleados, e => (e.modalidad && MODALIDADES[e.modalidad]) || 'Sin definir') },
    { titulo: 'Sede', filas: contarPor(empleados, e => e.sede?.trim() || 'Sin definir') },
    { titulo: 'Antigüedad', filas: contarPor(empleados, e => rangoAntiguedad(e.fecha_ingreso), ORDEN_ANTIGUEDAD) },
    { titulo: 'Jornada', filas: contarPor(empleados, e => (e.jornada && JORNADAS[e.jornada]) || 'Sin definir') },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Estructura */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 lg:col-span-2">
        <h3 className="font-bold text-marca-900">🏗️ Estructura de la plantilla</h3>
        <p className="text-xs text-slate-500 mb-4">{total} colaboradores activos con los filtros actuales.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{g.titulo}</p>
              <div className="space-y-1.5">
                {g.filas.slice(0, 6).map(f => (
                  <div key={f.etiqueta} className="flex items-center gap-2 text-xs" title={`${f.cantidad} de ${total}`}>
                    <span className={`w-28 truncate ${f.etiqueta === 'Sin definir' || f.etiqueta === 'Sin fecha' ? 'text-slate-400 italic' : 'text-slate-700'}`}>{f.etiqueta}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-marca-600" style={{ width: `${total ? (f.cantidad / total) * 100 : 0}%` }} />
                    </div>
                    <span className="w-14 text-right text-slate-700 font-semibold tabular-nums">{f.cantidad} <span className="text-slate-400 font-normal">{total ? Math.round((f.cantidad / total) * 100) : 0}%</span></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rotación */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-bold text-marca-900">🔄 Rotación (12 meses)</h3>
        <div className="flex items-baseline gap-3 mt-1 mb-3">
          <span className="text-3xl font-black text-marca-900">{rotacion.tasa12.toLocaleString('es-CO')}%</span>
          <span className="text-xs text-slate-500">{rotacion.ultimos12} salida(s)</span>
        </div>
        <div className="h-36" role="img" aria-label={`Salidas por mes: ${rotacion.porMes.map(m => `${m.etiqueta} ${m.cantidad}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rotacion.porMes} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [`${v} salida(s)`, '']} labelStyle={{ fontWeight: 700, color: '#334155' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11 }} />
              <Bar dataKey="cantidad" fill="#475569" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-4 mb-2">Motivos</p>
        {rotacion.porMotivo.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Sin salidas en los últimos 12 meses.</p>
        ) : (
          <div className="space-y-1">
            {rotacion.porMotivo.map(m => (
              <div key={m.motivo} className="flex justify-between text-xs text-slate-700">
                <span>{m.motivo}</span>
                <span className="font-semibold tabular-nums">{m.cantidad}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
