'use client'
// Informe 360 individual: radar "cómo me veo / cómo me ven", resultados por perspectiva, brechas (Johari), conductas
// destacadas, comentarios anónimos agrupados, calibración (Admin), conversación 1:1 (líder) y reflexión (la persona).
import { useEffect, useState } from 'react'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CUADRANTES, ETIQUETA_GRUPO, formatoPuntaje, type Cuadrante, type ResultadoCompetencia } from '@/lib/evaluacion360'
import { calibrar, cargarInforme, guardarReflexion, registrarConversacion, type DetalleInforme } from '@/lib/evaluacion360Api'
import { mensajeDeError } from '@/lib/errores'

interface Props { participanteId: number; onVolver: () => void; onCambio: () => void }

const colorPuntaje = (n: number | null) => n === null ? 'text-slate-300' : n >= 4 ? 'text-acento-700' : n >= 3 ? 'text-marca-700' : 'text-amber-700';

export function InformeIndividual({ participanteId, onVolver, onCambio }: Props) {
  const [d, setD] = useState<DetalleInforme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    cargarInforme(participanteId)
      .then(r => { if (vigente) { setD(r); setError(null); } })
      .catch(e => { if (vigente) setError(mensajeDeError(e)); });
    return () => { vigente = false; };
  }, [participanteId, version]);

  const recargar = () => { setVersion(v => v + 1); onCambio(); };

  if (error) return <div className="space-y-4"><Volver onVolver={onVolver} /><p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">{error}</p></div>;
  if (!d) return <div className="space-y-4"><Volver onVolver={onVolver} /><p className="text-sm text-slate-400 p-6">Cargando informe…</p></div>;

  const { informe: inf } = d;
  const radar = inf.competencias.map(c => ({ competencia: c.nombre, 'Cómo me ven': c.final ?? 0, 'Cómo me veo': c.auto ?? 0 }));
  const tendencia = d.anterior?.global != null && inf.global !== null ? Math.round((inf.global - d.anterior.global) * 10) / 10 : null;
  const sinDatos = inf.grupos.length === 0;

  return (
    <div className="space-y-6 animate-in fade-in">
      <Volver onVolver={onVolver} />

      {/* Encabezado */}
      <div className="bg-white rounded-3xl border border-marca-100 shadow-sm p-6 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-acento-700">{d.ciclo.nombre}</p>
          <h2 className="text-2xl font-extrabold text-marca-900">{d.esPropio ? 'Mi informe 360' : d.evaluado.nombre}</h2>
          <p className="text-sm text-slate-500">{d.evaluado.puesto}{d.lider && <> · Líder: {d.lider.nombre}</>}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {inf.grupos.map(g => <span key={g.clave} className="text-[11px] font-bold bg-marca-50 text-marca-700 px-2.5 py-1 rounded-full">{ETIQUETA_GRUPO[g.clave]} · {g.n}</span>)}
            {inf.ocultas > 0 && <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full" title="Para proteger el anonimato, un grupo con pocas respuestas no se muestra">🔒 {inf.ocultas} respuesta(s) no se muestran por anonimato</span>}
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <Cifra titulo="Cómo me ven" valor={inf.global} />
          <Cifra titulo="Cómo me veo" valor={inf.autoGlobal} />
          {d.anterior && <div><p className="text-[10px] font-black uppercase text-slate-400">vs. ciclo anterior</p>
            <p className={`font-titulo text-3xl font-extrabold ${tendencia === null ? 'text-slate-300' : tendencia >= 0 ? 'text-acento-700' : 'text-amber-700'}`}>{tendencia === null ? '—' : `${tendencia >= 0 ? '+' : ''}${formatoPuntaje(tendencia)}`}</p>
            <p className="text-[10px] text-slate-400">{d.anterior.ciclo}</p></div>}
        </div>
      </div>

      {!d.esPropio && !d.conversado_en && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3">
          👁️ {d.evaluado.nombre.split(' ')[0]} verá este informe cuando su líder registre la conversación 1:1 de resultados.
        </p>
      )}

      {sinDatos ? (
        <div className="bg-white border border-dashed border-marca-200 rounded-3xl p-8 text-center text-sm text-slate-500">Aún no hay evaluaciones de otras personas que se puedan mostrar.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <div className="xl:col-span-2 bg-white rounded-3xl border border-marca-100 p-5">
              <h3 className="font-extrabold text-marca-900 text-sm mb-2">Perfil de competencias</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="70%">
                    <PolarGrid stroke="#d9e3ee" />
                    <PolarAngleAxis dataKey="competencia" tick={{ fontSize: 10, fill: '#2a4b70' }} />
                    <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9, fill: '#8aa5c2' }} />
                    <Radar name="Cómo me ven" dataKey="Cómo me ven" stroke="#059669" fill="#10b981" fillOpacity={0.35} />
                    <Radar name="Cómo me veo" dataKey="Cómo me veo" stroke="#0f2942" fill="#0f2942" fillOpacity={0.08} strokeDasharray="4 3" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatoPuntaje(Number(v))} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <TablaCompetencias d={d} onCambio={recargar} />
          </div>

          <Johari competencias={inf.competencias} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListaConductas titulo="⭐ Conductas más valoradas" items={inf.destacadas} tono="acento" />
            <ListaConductas titulo="🌱 Conductas con más espacio de mejora" items={inf.aMejorar} tono="amber" />
          </div>

          <div className="bg-white rounded-3xl border border-marca-100 p-5">
            <h3 className="font-extrabold text-marca-900 text-sm">Comentarios</h3>
            <p className="text-[11px] text-slate-500 mb-4">Los de pares y colaboradores se muestran juntos y sin orden de llegada, para proteger el anonimato.</p>
            {inf.comentarios.length === 0 ? <p className="text-sm text-slate-400">Sin comentarios.</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Comentarios titulo="✅ Seguir haciendo" items={inf.comentarios.map(c => ({ origen: c.origen, texto: c.fortaleza }))} />
                <Comentarios titulo="🚀 Consejos para el próximo período" items={inf.comentarios.map(c => ({ origen: c.origen, texto: c.consejo }))} />
              </div>
            )}
          </div>
        </>
      )}

      <Conversacion d={d} onCambio={recargar} />
    </div>
  );
}

function Volver({ onVolver }: { onVolver: () => void }) {
  return <button type="button" onClick={onVolver} className="text-xs font-bold text-marca-600 hover:text-marca-900">← Volver a la lista</button>;
}

function Cifra({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400">{titulo}</p>
      <p className={`font-titulo text-3xl font-extrabold ${colorPuntaje(valor)}`}>{formatoPuntaje(valor)}</p>
      <p className="text-[10px] text-slate-400">de 5</p>
    </div>
  );
}

function TablaCompetencias({ d, onCambio }: { d: DetalleInforme; onCambio: () => void }) {
  const [ajustando, setAjustando] = useState<number | null>(null);
  const grupos = d.informe.grupos.map(g => g.clave);
  return (
    <div className="xl:col-span-3 bg-white rounded-3xl border border-marca-100 p-5 overflow-x-auto">
      <h3 className="font-extrabold text-marca-900 text-sm mb-3">Resultado por competencia</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-slate-400 text-right">
            <th className="text-left font-black pb-2">Competencia</th>
            <th className="font-black pb-2 px-2">Yo</th>
            {grupos.map(g => <th key={g} className="font-black pb-2 px-2">{ETIQUETA_GRUPO[g]}</th>)}
            <th className="font-black pb-2 px-2 text-marca-900">Resultado</th>
            <th className="font-black pb-2 pl-2" title="Autoevaluación menos resultado: positivo = te ves mejor de lo que te ven">Brecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {d.informe.competencias.map(c => (
            <FilaCompetencia key={c.id} c={c} grupos={grupos} d={d} abierta={ajustando === c.id}
              onAjustar={() => setAjustando(ajustando === c.id ? null : c.id)} onCambio={() => { setAjustando(null); onCambio(); }} />
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-3">Resultado = promedio ponderado de las perspectivas visibles (la autoevaluación no suma). Escala de 1 a 5.</p>
    </div>
  );
}

function FilaCompetencia({ c, grupos, d, abierta, onAjustar, onCambio }: {
  c: ResultadoCompetencia; grupos: string[]; d: DetalleInforme; abierta: boolean; onAjustar: () => void; onCambio: () => void;
}) {
  const [puntaje, setPuntaje] = useState(String(c.calibracion?.puntaje ?? c.otros ?? 3));
  const [justificacion, setJustificacion] = useState(c.calibracion?.justificacion ?? '');
  async function guardar(quitar = false) {
    try { await calibrar(d.participante_id, c.id, quitar ? null : Number(puntaje.replace(',', '.')), justificacion); onCambio(); }
    catch (e) { alert(mensajeDeError(e)); }
  }
  return (
    <>
      <tr className="text-right">
        <td className="text-left py-2 pr-2">
          <span className="font-bold text-marca-900">{c.nombre}</span>
          {c.grupo === 'liderazgo' && <span className="ml-1 text-[9px] font-black uppercase text-marca-500">· liderazgo</span>}
          {c.calibracion && <span className="block text-[10px] text-acento-700 font-bold" title={c.calibracion.justificacion || undefined}>⚖️ Ajustado en calibración{c.calibracion.justificacion && `: ${c.calibracion.justificacion}`}</span>}
        </td>
        <td className="px-2 text-slate-500">{formatoPuntaje(c.auto)}</td>
        {grupos.map(g => <td key={g} className="px-2 text-slate-600">{formatoPuntaje(c.porGrupo[g as keyof typeof c.porGrupo])}</td>)}
        <td className={`px-2 font-extrabold text-sm ${colorPuntaje(c.final)}`}>
          {formatoPuntaje(c.final)}
          {d.permisos.calibrar && <button type="button" onClick={onAjustar} className="ml-2 text-[10px] font-bold text-acento-700 hover:underline">Ajustar</button>}
        </td>
        <td className={`pl-2 font-bold ${c.brecha === null ? 'text-slate-300' : Math.abs(c.brecha) >= 0.75 ? 'text-amber-700' : 'text-slate-500'}`}>
          {c.brecha === null ? '—' : `${c.brecha > 0 ? '+' : ''}${formatoPuntaje(c.brecha)}`}
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={grupos.length + 4} className="pb-3">
            <div className="bg-acento-50 border border-acento-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
              <label className="text-[10px] font-black uppercase text-acento-800">Puntaje calibrado
                <input value={puntaje} onChange={e => setPuntaje(e.target.value)} inputMode="decimal" className="block mt-1 w-20 text-sm bg-white border border-acento-200 rounded-lg p-1.5" />
              </label>
              <label className="flex-1 min-w-56 text-[10px] font-black uppercase text-acento-800">Justificación (queda registrada)
                <input value={justificacion} onChange={e => setJustificacion(e.target.value)} className="block mt-1 w-full text-sm bg-white border border-acento-200 rounded-lg p-1.5 normal-case font-normal" />
              </label>
              <button type="button" onClick={() => guardar()} className="px-3 py-2 text-xs font-bold text-white bg-acento-600 rounded-lg">Guardar</button>
              {c.calibracion && <button type="button" onClick={() => guardar(true)} className="px-3 py-2 text-xs font-bold text-slate-500">Quitar ajuste</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Johari({ competencias }: { competencias: ResultadoCompetencia[] }) {
  const orden: Cuadrante[] = ['fortaleza', 'oculta', 'punto_ciego', 'oportunidad'];
  const estilo: Record<Cuadrante, string> = {
    fortaleza: 'bg-acento-50 border-acento-200', oculta: 'bg-marca-50 border-marca-100',
    punto_ciego: 'bg-amber-50 border-amber-200', oportunidad: 'bg-slate-50 border-slate-200',
  };
  if (!competencias.some(c => c.cuadrante)) return null;
  return (
    <div className="bg-white rounded-3xl border border-marca-100 p-5">
      <h3 className="font-extrabold text-marca-900 text-sm">Mapa de percepción</h3>
      <p className="text-[11px] text-slate-500 mb-4">Compara tu autoevaluación con el resultado (alto = 3,5 o más).</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {orden.map(q => {
          const lista = competencias.filter(c => c.cuadrante === q);
          return (
            <div key={q} className={`rounded-2xl border p-4 ${estilo[q]}`}>
              <p className="font-extrabold text-marca-900 text-sm">{CUADRANTES[q].titulo}</p>
              <p className="text-[11px] text-slate-500 mb-2">{CUADRANTES[q].descripcion}</p>
              {lista.length === 0 ? <p className="text-xs text-slate-400">—</p> : (
                <ul className="flex flex-wrap gap-1.5">{lista.map(c => <li key={c.id} className="text-[11px] font-bold bg-white/80 border border-white rounded-full px-2.5 py-1 text-marca-800">{c.nombre}</li>)}</ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListaConductas({ titulo, items, tono }: { titulo: string; items: { texto: string; competencia: string; promedio: number }[]; tono: 'acento' | 'amber' }) {
  return (
    <div className="bg-white rounded-3xl border border-marca-100 p-5">
      <h3 className="font-extrabold text-marca-900 text-sm mb-3">{titulo}</h3>
      {items.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
        <ul className="space-y-2">
          {items.map(x => (
            <li key={x.texto} className="flex items-start gap-3">
              <span className={`shrink-0 font-extrabold text-sm w-10 text-right ${tono === 'acento' ? 'text-acento-700' : 'text-amber-700'}`}>{formatoPuntaje(x.promedio)}</span>
              <span className="text-sm text-slate-700">{x.texto}<span className="block text-[10px] text-slate-400">{x.competencia}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comentarios({ titulo, items }: { titulo: string; items: { origen: string; texto: string }[] }) {
  const visibles = items.filter(i => i.texto);
  return (
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 mb-2">{titulo}</p>
      <ul className="space-y-2">
        {visibles.map((i, k) => (
          <li key={k} className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3">
            “{i.texto}”<span className="block text-[10px] font-bold text-marca-400 mt-1">{i.origen}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Conversacion({ d, onCambio }: { d: DetalleInforme; onCambio: () => void }) {
  const [acuerdos, setAcuerdos] = useState(d.acuerdos ?? '');
  const [reflexion, setReflexion] = useState(d.reflexion ?? '');
  const [guardando, setGuardando] = useState(false);
  async function ejecutar(f: () => Promise<unknown>) {
    setGuardando(true);
    try { await f(); onCambio(); } catch (e) { alert(mensajeDeError(e)); } finally { setGuardando(false); }
  }
  const nombre = d.evaluado.nombre.split(' ')[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <h3 className="font-extrabold text-marca-900 text-sm">🤝 Conversación 1:1 de resultados</h3>
        {d.conversado_en
          ? <p className="text-[11px] text-acento-700 font-bold mt-1">Realizada el {new Date(d.conversado_en).toLocaleDateString('es')}{d.conversado_por && ` con ${d.conversado_por}`}</p>
          : <p className="text-[11px] text-slate-500 mt-1">Pendiente.</p>}
        {d.permisos.conversar && !d.conversado_en && (
          <ol className="text-[11px] text-slate-600 list-decimal pl-4 my-3 space-y-0.5">
            <li>Empieza preguntando a {nombre} qué le sorprendió y qué le resonó.</li>
            <li>Reconoce 1–2 fortalezas con ejemplos.</li>
            <li>Conversa los puntos ciegos sin buscar culpables: pide ejemplos y escucha.</li>
            <li>Elijan juntos 1–2 focos de desarrollo para el próximo período.</li>
            <li>Registra los acuerdos: qué hará, con qué apoyo y cuándo lo revisarán.</li>
          </ol>
        )}
        {d.permisos.conversar ? (
          <>
            <textarea value={acuerdos} onChange={e => setAcuerdos(e.target.value)} maxLength={2000}
              className="mt-2 w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-acento-500 h-28 resize-none"
              placeholder="Acuerdos: focos de desarrollo, acciones, apoyo y fecha de seguimiento." />
            <button type="button" disabled={guardando} onClick={() => ejecutar(() => registrarConversacion(d.participante_id, acuerdos))}
              className="mt-2 px-4 py-2 text-xs font-bold text-white bg-acento-600 hover:bg-acento-700 disabled:opacity-50 rounded-xl">
              {d.conversado_en ? 'Actualizar acuerdos' : `Registrar conversación y liberar el informe a ${nombre}`}
            </button>
          </>
        ) : d.acuerdos ? <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3">{d.acuerdos}</p> : null}
      </div>

      <div className="bg-white rounded-3xl border border-marca-100 p-5">
        <h3 className="font-extrabold text-marca-900 text-sm">💭 {d.esPropio ? 'Mi reflexión' : `Reflexión de ${nombre}`}</h3>
        <p className="text-[11px] text-slate-500 mt-1">{d.esPropio ? '¿Qué te llevas de este informe y en qué te vas a enfocar?' : 'La persona puede dejarla después de la conversación.'}</p>
        {d.permisos.reflexionar ? (
          <>
            <textarea value={reflexion} onChange={e => setReflexion(e.target.value)} maxLength={2000}
              className="mt-3 w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-acento-500 h-28 resize-none" />
            <button type="button" disabled={guardando} onClick={() => ejecutar(() => guardarReflexion(d.participante_id, reflexion))}
              className="mt-2 px-4 py-2 text-xs font-bold text-white bg-marca-900 hover:bg-marca-800 disabled:opacity-50 rounded-xl">Guardar reflexión</button>
          </>
        ) : <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3">{d.reflexion || '—'}</p>}
      </div>
    </div>
  );
}
