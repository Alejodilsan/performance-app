import { randomInt } from 'crypto'

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar o copiar a mano sin errores
const MAYUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUS = 'abcdefghijkmnpqrstuvwxyz';
const DIGITOS = '23456789';

const elegir = (alfabeto: string) => alfabeto[randomInt(alfabeto.length)];

/** Clave temporal aleatoria y legible, p. ej. "Kp7m-X3qt-9Fzc". Se usa una sola vez: el usuario debe cambiarla al entrar. */
export function generarClaveTemporal(): string {
  const todos = MAYUS + MINUS + DIGITOS;
  const bloque = () => Array.from({ length: 4 }, () => elegir(todos)).join('');
  let clave = '';
  // Garantiza al menos una mayúscula, una minúscula y un dígito
  do { clave = `${bloque()}-${bloque()}-${bloque()}`; }
  while (!/[A-Z]/.test(clave) || !/[a-z]/.test(clave) || !/[0-9]/.test(clave));
  return clave;
}
