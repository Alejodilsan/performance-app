'use client'
// Umbrales de desempeño configurados por el Admin, disponibles en toda la app (tarjetas, tablero, BI).
import { createContext, useContext } from 'react'
import { CONFIG_BI_DEFECTO, type UmbralesDesempeno } from './bi'

const UmbralesContext = createContext<UmbralesDesempeno>(CONFIG_BI_DEFECTO);

export const ProveedorUmbrales = UmbralesContext.Provider;
export const useUmbrales = () => useContext(UmbralesContext);

/** Clases de color según el nivel de desempeño (texto y barra). */
export function coloresDesempeno(score: number, u: UmbralesDesempeno) {
  if (score >= u.umbral_desempeno_alto) return { texto: 'text-acento-600', barra: 'bg-acento-500' };
  if (score >= u.umbral_desempeno_bajo) return { texto: 'text-marca-600', barra: 'bg-marca-500' };
  // Bajo el umbral: oportunidad de mejora (ámbar), no "fracaso" (rojo)
  return { texto: 'text-amber-600', barra: 'bg-amber-500' };
}
