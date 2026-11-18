'use client'
import { useMemo, useState, type ReactNode } from 'react'
import {
  TIPOS_DOCUMENTO, TIPOS_CONTRATO, MODALIDADES, JORNADAS, PERIODICIDADES, MONEDAS,
  type Area, type Compensacion, type Empleado, type Puesto, type TipoPerfil,
} from '@/lib/tipos'
import {
  datosVacios, datosDesdeEmpleado, compensacionVacia, validarColaborador, validarCompensacion,
  opcionesJefeDirecto, formatearMonto, parsearMonto,
  type DatosColaborador, type DatosCompensacion,
} from '@/lib/colaboradores'
import { agruparCargosParaArea, etiquetaCargo } from '@/lib/cargos'
import { buscarParecidos } from '@/lib/similitud'

export interface OpcionesGuardado { darAcceso: boolean }

interface Props {
  modo: 'crear' | 'editar';
  emp?: Empleado;
  puestos: Puesto[];
  areas: Area[];
  activos: Empleado[];
  desvinculados: Empleado[];
  roles: TipoPerfil[];
  monedaPorDefecto: string;
  /** Historial de salarios (solo edición); null = cargando */
  compensaciones?: Compensacion[] | null;
  /** Crea un cargo en el área indicada (el área es obligatoria para los cargos) */
  onCrearPuesto: (nombre: string, areaId: number) => Promise<Puesto | null>;
  /** Devuelve true si se guardó. */
  onGuardar: (datos: DatosColaborador, compensacion: DatosCompensacion, opciones: OpcionesGuardado) => Promise<boolean>;
  onDesvincular?: (emp: Empleado) => void;
  onClose: () => void;
}

type Seccion = 'laborales' | 'personales' | 'compensacion';
const CAMPOS_SECCION: Record<Seccion, (keyof DatosColaborador)[]> = {
  laborales: ['sede', 'tipo_contrato', 'modalidad', 'jornada', 'centro_costo'],
  personales: ['tipo_documento', 'numero_documento', 'fecha_nacimiento', 'telefono', 'email_personal'],
  compensacion: [],
};

const inputCls = 'w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#FF4C4C] focus:bg-white transition-colors disabled:text-slate-500 disabled:cursor-not-allowed';

export function PanelColaborador({
  modo, emp, puestos, areas, activos, desvinculados, roles, monedaPorDefecto, compensaciones,
  onCrearPuesto, onGuardar, onDesvincular, onClose,
}: Props) {
  const esEdicion = modo === 'editar' && !!emp;
  const inicial = useMemo(() => (esEdicion ? datosDesdeEmpleado(emp!, puestos) : datosVacios()), [esEdicion, emp, puestos]);

  const [d, setD] = useState<DatosColaborador>(inicial);
  const [comp, setComp] = useState<DatosCompensacion>(() => ({
    ...compensacionVacia(monedaPorDefecto),
    motivo: esEdicion ? '' : 'Salario de ingreso',
  }));
  const [darAcceso, setDarAcceso] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<Seccion>>(new Set());
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [jefeTocado, setJefeTocado] = useState(esEdicion && !!emp?.jefe_directo_id);
  const [nuevoPuesto, setNuevoPuesto] = useState<string | null>(null); // null = no se está creando
  const [creandoPuesto, setCreandoPuesto] = useState(false);
  const [guardadosEnSesion, setGuardadosEnSesion] = useState(0);

  const errores = validarColaborador(d, { empleadoId: emp?.id, activos, desvinculados });
  const erroresComp = validarCompensacion(comp);
  const hayErrores = Object.keys(errores).length > 0 || Object.keys(erroresComp).length > 0;
  const err = (campo: keyof DatosColaborador) => (intentoGuardar ? errores[campo] : undefined);
  const errC = (campo: keyof DatosCompensacion) => (intentoGuardar ? erroresComp[campo] : undefined);

  const opcionesJefe = useMemo(() => opcionesJefeDirecto(activos, emp?.id), [activos, emp?.id]);
  const sedes = useMemo(() => valoresUnicos(activos.map(e => e.sede)), [activos]);
  const centrosCosto = useMemo(() => valoresUnicos(activos.map(e => e.centro_costo)), [activos]);
  const salarioVigente = compensaciones && compensaciones.length > 0 ? compensaciones[0] : null;
  const modificado = JSON.stringify(d) !== JSON.stringify(inicial) || comp.salario.trim() !== '';

  const set = <K extends keyof DatosColaborador>(campo: K, valor: DatosColaborador[K]) => setD(prev => ({ ...prev, [campo]: valor }));
  const setC = <K extends keyof DatosCompensacion>(campo: K, valor: DatosCompensacion[K]) => setComp(prev => ({ ...prev, [campo]: valor }));
  const toggleSeccion = (s: Seccion) => setAbiertas(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  // Al elegir área, se sugiere como jefe directo al líder del área (si no se eligió uno a mano)
  function cambiarArea(areaId: string) {
    set('area_id', areaId);
    if (jefeTocado) return;
    const lider = areas.find(a => String(a.id) === areaId)?.lider_id;
    const sugerido = lider && lider !== emp?.id && opcionesJefe.some(e => e.id === lider) ? String(lider) : '';
    set('jefe_directo_id', sugerido);
  }

  async function confirmarNuevoPuesto() {
    const nombre = (nuevoPuesto || '').trim();
    if (!nombre || !d.area_id) return;
    setCreandoPuesto(true);
    const creado = await onCrearPuesto(nombre, Number(d.area_id));
    setCreandoPuesto(false);
    if (creado) { set('puesto_id', String(creado.id)); setNuevoPuesto(null); }
  }

  // Cargos: primero los del área elegida
  const areaIdNum = d.area_id ? Number(d.area_id) : null;
  const nombreAreaSel = areas.find(a => a.id === areaIdNum)?.nombre;
  const grupos = useMemo(() => agruparCargosParaArea(puestos, areaIdNum, areas), [puestos, areaIdNum, areas]);
  const cargoSel = puestos.find(p => String(p.id) === d.puesto_id);
  const avisoCargo = !cargoSel ? undefined
    : cargoSel.area_id == null ? 'Este cargo aún no tiene área: complétala en el catálogo de cargos.'
    : areaIdNum !== null && cargoSel.area_id !== areaIdNum ? `Este cargo pertenece a "${areas.find(a => a.id === cargoSel.area_id)?.nombre ?? 'otra área'}".`
    : undefined;
  const parecidosNuevo = nuevoPuesto && areaIdNum !== null
    ? buscarParecidos(nuevoPuesto, grupos.deArea.map(p => ({ valor: p.id, nombre: p.nombre })))
    : [];

  async function guardar(agregarOtro: boolean) {
    setIntentoGuardar(true);
    if (hayErrores) {
      // Abre las secciones plegadas que tienen errores para que se vean
      const conError = (Object.keys(CAMPOS_SECCION) as Seccion[]).filter(s =>
        CAMPOS_SECCION[s].some(c => errores[c]) || (s === 'compensacion' && Object.keys(erroresComp).length > 0));
      setAbiertas(prev => new Set([...prev, ...conError]));
      return;
    }
    setGuardando(true);
    const ok = await onGuardar(d, comp, { darAcceso: !esEdicion && darAcceso });
    setGuardando(false);
    if (!ok) return;
    if (agregarOtro) {
      // Mantiene los datos que suelen repetirse en una contratación por lotes
      setD({
        ...datosVacios(), area_id: d.area_id, jefe_directo_id: d.jefe_directo_id, puesto_id: d.puesto_id, fecha_ingreso: d.fecha_ingreso,
        sede: d.sede, tipo_contrato: d.tipo_contrato, modalidad: d.modalidad, jornada: d.jornada, centro_costo: d.centro_costo,
      });
      setComp({ ...compensacionVacia(comp.moneda), periodicidad: comp.periodicidad, motivo: 'Salario de ingreso' });
      setIntentoGuardar(false);
      setGuardadosEnSesion(n => n + 1);
    } else {
      onClose();
    }
  }

  function cerrar() {
    if (modificado && !window.confirm('Hay cambios sin guardar. ¿Cerrar de todas formas?')) return;
    onClose();
  }

  const completitud = (s: Seccion) => {
    const campos = CAMPOS_SECCION[s];
    return `${campos.filter(c => String(d[c] ?? '').trim() !== '').length}/${campos.length}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in" onMouseDown={e => { if (e.target === e.currentTarget) cerrar(); }}>
      <form
        onSubmit={e => { e.preventDefault(); guardar(false); }}
        className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">{esEdicion ? `Editar: ${emp!.nombre}` : 'Nuevo colaborador'}</h3>
            <p className="text-[11px] text-slate-500">
              {esEdicion ? 'Actualiza la ficha del colaborador.' : 'Solo los campos con * son obligatorios; el resto puedes completarlo después.'}
              {guardadosEnSesion > 0 && <span className="ml-1 font-bold text-emerald-600">✓ {guardadosEnSesion} guardado(s)</span>}
            </p>
          </div>
          <button type="button" onClick={cerrar} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 shrink-0" aria-label="Cerrar">✕</button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">

          {/* 1. Esenciales */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Datos esenciales</h4>

            <Campo label="Nombre completo *" error={err('nombre')}>
              <input className={inputCls} value={d.nombre} onChange={e => set('nombre', e.target.value)} autoFocus={!esEdicion} />
            </Campo>

            <Campo
              label="Correo corporativo *"
              error={err('email')}
              ayuda={esEdicion ? 'Vinculado a la cuenta de acceso: no se puede cambiar aquí.' : 'Será su usuario para entrar a la plataforma.'}
            >
              <input type="email" className={inputCls} value={d.email} onChange={e => set('email', e.target.value)} disabled={esEdicion} />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Área" error={err('area_id')}>
                <select className={inputCls} value={d.area_id} onChange={e => cambiarArea(e.target.value)}>
                  <option value="">-- Sin área (pendiente) --</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}{a.lider_id && a.lider_id === emp?.id ? ' (lidera)' : ''}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Cargo *" error={err('puesto_id')} ayuda={nuevoPuesto === null ? avisoCargo : undefined}>
                {nuevoPuesto === null ? (
                  <select
                    className={inputCls}
                    value={d.puesto_id}
                    onChange={e => (e.target.value === '__nuevo' ? setNuevoPuesto('') : set('puesto_id', e.target.value))}
                  >
                    <option value="">-- Seleccionar --</option>
                    {grupos.deArea.length > 0 && (
                      <optgroup label={`De ${nombreAreaSel}`}>
                        {grupos.deArea.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </optgroup>
                    )}
                    {grupos.superiores.length > 0 && (
                      <optgroup label="De áreas superiores">
                        {grupos.superiores.map(p => <option key={p.id} value={p.id}>{etiquetaCargo(p, areas, puestos, true)}</option>)}
                      </optgroup>
                    )}
                    {grupos.otras.length > 0 && (
                      <optgroup label={areaIdNum !== null ? 'Otras áreas' : 'Cargos'}>
                        {grupos.otras.map(p => <option key={p.id} value={p.id}>{etiquetaCargo(p, areas, puestos, true)}</option>)}
                      </optgroup>
                    )}
                    {grupos.sinArea.length > 0 && (
                      <optgroup label="Sin área asignada">
                        {grupos.sinArea.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </optgroup>
                    )}
                    {areaIdNum !== null
                      ? <option value="__nuevo">+ Crear cargo en {nombreAreaSel}…</option>
                      : <option value="" disabled>(Elige un área para crear un cargo nuevo)</option>}
                  </select>
                ) : (
                  <>
                    <div className="flex gap-1">
                      <input
                        className={inputCls}
                        placeholder={`Nuevo cargo en ${nombreAreaSel}`}
                        value={nuevoPuesto}
                        autoFocus
                        onChange={e => setNuevoPuesto(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); confirmarNuevoPuesto(); }
                          if (e.key === 'Escape') setNuevoPuesto(null);
                        }}
                      />
                      <button type="button" onClick={confirmarNuevoPuesto} disabled={creandoPuesto || !nuevoPuesto.trim()} className="px-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-40">✓</button>
                      <button type="button" onClick={() => setNuevoPuesto(null)} className="px-2 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-100">✕</button>
                    </div>
                    {parecidosNuevo.length > 0 && (
                      <p className="text-[10px] text-amber-700 mt-1">◐ Se parece a {parecidosNuevo.map(p => `«${p.nombre}»`).join(', ')}: ¿no es el mismo?</p>
                    )}
                  </>
                )}
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo de perfil *" ayuda="Define sus permisos en la plataforma.">
                <select className={inputCls} value={d.tipo_perfil} onChange={e => set('tipo_perfil', e.target.value as TipoPerfil)}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Campo>
              <Campo
                label="Jefe directo"
                error={err('jefe_directo_id')}
                ayuda={!jefeTocado && d.jefe_directo_id ? 'Sugerido: líder del área.' : undefined}
              >
                <select className={inputCls} value={d.jefe_directo_id} onChange={e => { setJefeTocado(true); set('jefe_directo_id', e.target.value); }}>
                  <option value="">-- Sin jefe directo --</option>
                  {opcionesJefe.map(e => <option key={e.id} value={e.id}>{e.nombre} · {e.puesto}</option>)}
                </select>
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha de ingreso" error={err('fecha_ingreso')}>
                <input type="date" className={inputCls} value={d.fecha_ingreso} onChange={e => set('fecha_ingreso', e.target.value)} />
              </Campo>
            </div>
          </section>

          {/* 2. Laborales */}
          <SeccionPlegable titulo="Datos laborales" detalle={completitud('laborales')} abierta={abiertas.has('laborales')} onToggle={() => toggleSeccion('laborales')}>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Sede / ubicación" error={err('sede')}>
                <input className={inputCls} list="lista-sedes" value={d.sede} onChange={e => set('sede', e.target.value)} placeholder="Ej: Bogotá - Oficina principal" />
                <datalist id="lista-sedes">{sedes.map(s => <option key={s} value={s} />)}</datalist>
              </Campo>
              <Campo label="Centro de costo" error={err('centro_costo')}>
                <input className={inputCls} list="lista-centros" value={d.centro_costo} onChange={e => set('centro_costo', e.target.value)} placeholder="Ej: CC-100 Comercial" />
                <datalist id="lista-centros">{centrosCosto.map(s => <option key={s} value={s} />)}</datalist>
              </Campo>
              <Campo label="Tipo de contrato" error={err('tipo_contrato')}>
                <select className={inputCls} value={d.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value as DatosColaborador['tipo_contrato'])}>
                  <option value="">-- Sin definir --</option>
                  {Object.entries(TIPOS_CONTRATO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Modalidad" error={err('modalidad')}>
                <select className={inputCls} value={d.modalidad} onChange={e => set('modalidad', e.target.value as DatosColaborador['modalidad'])}>
                  <option value="">-- Sin definir --</option>
                  {Object.entries(MODALIDADES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Jornada" error={err('jornada')}>
                <select className={inputCls} value={d.jornada} onChange={e => set('jornada', e.target.value as DatosColaborador['jornada'])}>
                  <option value="">-- Sin definir --</option>
                  {Object.entries(JORNADAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
            </div>
          </SeccionPlegable>

          {/* 3. Personales */}
          <SeccionPlegable titulo="Datos personales" detalle={completitud('personales')} abierta={abiertas.has('personales')} onToggle={() => toggleSeccion('personales')}>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo de documento" error={err('tipo_documento')}>
                <select className={inputCls} value={d.tipo_documento} onChange={e => set('tipo_documento', e.target.value)}>
                  <option value="">-- Seleccionar --</option>
                  {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Número de documento" error={err('numero_documento')}>
                <input className={inputCls} value={d.numero_documento} onChange={e => set('numero_documento', e.target.value)} />
              </Campo>
              <Campo label="Fecha de nacimiento" error={err('fecha_nacimiento')}>
                <input type="date" className={inputCls} value={d.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} />
              </Campo>
              <Campo label="Teléfono" error={err('telefono')}>
                <input type="tel" className={inputCls} value={d.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+57 300 000 0000" />
              </Campo>
              <div className="col-span-2">
                <Campo label="Correo personal" error={err('email_personal')}>
                  <input type="email" className={inputCls} value={d.email_personal} onChange={e => set('email_personal', e.target.value)} />
                </Campo>
              </div>
            </div>
          </SeccionPlegable>

          {/* 4. Compensación (solo Admin) */}
          <SeccionPlegable
            titulo="Compensación"
            detalle={salarioVigente ? formatearMonto(salarioVigente.salario, salarioVigente.moneda) : '🔒 Solo Admin'}
            abierta={abiertas.has('compensacion')}
            onToggle={() => toggleSeccion('compensacion')}
          >
            <p className="text-[11px] text-slate-500 mb-3">
              🔒 Solo los administradores pueden ver y editar esta información.
              {esEdicion && ' Cada cambio queda en el historial; deja el monto vacío si no cambia.'}
            </p>

            {esEdicion && (
              <div className="mb-3">
                {compensaciones === null ? (
                  <p className="text-[11px] text-slate-400 italic">Cargando historial…</p>
                ) : compensaciones && compensaciones.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-[9px] uppercase text-slate-400 tracking-wider">
                        <tr><th className="text-left px-3 py-1.5">Vigente desde</th><th className="text-right px-3 py-1.5">Salario</th><th className="text-left px-3 py-1.5">Motivo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {compensaciones.slice(0, 5).map((c, i) => (
                          <tr key={c.id} className={i === 0 ? 'font-bold text-slate-800' : 'text-slate-500'}>
                            <td className="px-3 py-1.5">{c.fecha_vigencia}{i === 0 && <span className="ml-1 text-[9px] text-emerald-600">vigente</span>}</td>
                            <td className="px-3 py-1.5 text-right">{formatearMonto(c.salario, c.moneda)} <span className="font-normal text-slate-400">/{PERIODICIDADES[c.periodicidad].toLowerCase()}</span></td>
                            <td className="px-3 py-1.5 truncate max-w-[140px]" title={c.motivo || ''}>{c.motivo || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Sin salario registrado.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label={esEdicion ? 'Nuevo salario' : 'Salario'} error={errC('salario')} ayuda={comp.salario && parsearMonto(comp.salario) ? formatearMonto(parsearMonto(comp.salario)!, comp.moneda) : undefined}>
                <input className={inputCls} inputMode="decimal" value={comp.salario} onChange={e => setC('salario', e.target.value)} placeholder="Ej: 3.500.000" />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Moneda" error={errC('moneda')}>
                  <select className={inputCls} value={comp.moneda} onChange={e => setC('moneda', e.target.value)}>
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo label="Periodo" error={errC('periodicidad')}>
                  <select className={inputCls} value={comp.periodicidad} onChange={e => setC('periodicidad', e.target.value as DatosCompensacion['periodicidad'])}>
                    {Object.entries(PERIODICIDADES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </Campo>
              </div>
              <Campo label="Vigente desde" error={errC('fecha_vigencia')}>
                <input type="date" className={inputCls} value={comp.fecha_vigencia} onChange={e => setC('fecha_vigencia', e.target.value)} />
              </Campo>
              <Campo label="Motivo">
                <input className={inputCls} value={comp.motivo} onChange={e => setC('motivo', e.target.value)} placeholder={esEdicion ? 'Ej: Aumento anual' : 'Salario de ingreso'} />
              </Campo>
            </div>
          </SeccionPlegable>

          {/* 5. Acceso (solo al crear) */}
          {!esEdicion && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer">
              <input type="checkbox" checked={darAcceso} onChange={e => setDarAcceso(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#FF4C4C]" />
              <span className="text-xs">
                <span className="font-bold text-slate-800">🔑 Dar acceso a la plataforma ahora</span>
                <span className="block text-[11px] text-slate-500">Se genera una clave temporal que verás al guardar. Al entrar, deberá crear su propia contraseña.</span>
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0 bg-white">
          <div>
            {intentoGuardar && hayErrores && <span className="text-[11px] font-bold text-red-600">Revisa los campos marcados.</span>}
            {esEdicion && onDesvincular && !(intentoGuardar && hayErrores) && (
              <button type="button" onClick={() => onDesvincular(emp!)} className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl border border-red-100">
                Desvincular…
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
            {!esEdicion && (
              <button type="button" onClick={() => guardar(true)} disabled={guardando} className="px-4 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-50">
                Guardar y agregar otro
              </button>
            )}
            <button type="submit" disabled={guardando} className="px-5 py-2 text-xs font-bold text-white bg-[#FF4C4C] hover:bg-red-600 rounded-xl shadow-sm disabled:opacity-50">
              {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar colaborador'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, error, ayuda, children }: { label: string; error?: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">{label}</label>
      {children}
      {error ? <p className="text-[10px] font-semibold text-red-600 mt-1">{error}</p> : ayuda ? <p className="text-[10px] text-slate-400 mt-1">{ayuda}</p> : null}
    </div>
  );
}

function SeccionPlegable({ titulo, detalle, abierta, onToggle, children }: { titulo: string; detalle?: string; abierta: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="border border-slate-200 rounded-2xl">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/60 rounded-2xl">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">{titulo}</span>
        <span className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
          {detalle}
          <span>{abierta ? '▲' : '▼'}</span>
        </span>
      </button>
      {abierta && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

const valoresUnicos = (valores: (string | null | undefined)[]) =>
  [...new Set(valores.filter((v): v is string => !!v && v.trim() !== '').map(v => v.trim()))].sort((a, b) => a.localeCompare(b, 'es'));
