'use client'
// Umbrales de desempeño configurados por el Admin, disponibles en toda la app (tarjetas, tablero, BI).
import { createContext, useContext } from 'react'
import { CONFIG_BI_DEFECTO, type UmbralesDesempeno } from './bi'

const UmbralesContext = createContext<UmbralesDesempeno>(CONFIG_BI_DEFECTO);

export const ProveedorUmbrales = UmbralesContext.Provider;
export const useUmbrales = () => useContext(UmbralesContext);

/** Clases de color según el nivel de desempeño (texto y barra). */
export function coloresDesempeno(score: number, u: UmbralesDesempeno) {
  if (score >= u.umbral_desempeno_alto) return { texto: 'text-emerald-600', barra: 'bg-emerald-500' };
  if (score >= u.umbral_desempeno_bajo) return { texto: 'text-blue-600', barra: 'bg-blue-500' };
  return { texto: 'text-[#FF4C4C]', barra: 'bg-[#FF4C4C]' };
}
