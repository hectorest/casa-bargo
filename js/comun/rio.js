// Geometría del río: funciones puras compartidas por la simulación y la escena.
// El barco avanza hacia -z. El centro del río en cada z lo da riverX(z).

export const MEDIO_ANCHO = 7; // medio ancho del cauce

export function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function ruido(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const riverX = z => Math.sin(z * 0.018) * 14 + Math.sin(z * 0.0071 + 1.3) * 22;

// Pendiente dx/dz del centro del río
export const riverPendiente = z => 0.018 * 14 * Math.cos(z * 0.018) + 0.0071 * 22 * Math.cos(z * 0.0071 + 1.3);

// Curvatura d²x/dz²
export const riverCurvatura = z => -0.018 * 0.018 * 14 * Math.sin(z * 0.018) - 0.0071 * 0.0071 * 22 * Math.sin(z * 0.0071 + 1.3);

// Ángulo de la dirección del río para quien navega hacia -z (0 = recto; positivo = hacia +x)
export const riverRumbo = z => Math.atan(-riverPendiente(z));

export function alturaTerreno(x, z) {
  const d = Math.abs(x - riverX(z));
  if (d < MEDIO_ANCHO) return -1.6;
  const t = Math.min(1, (d - MEDIO_ANCHO) / 10);
  const orilla = t * t * (3 - 2 * t) * 2.4;
  const colinas = ruido(x * 0.04, z * 0.04) * 9 * Math.min(1, (d - MEDIO_ANCHO) / 30);
  return -1.6 + orilla + 1.0 + colinas * (d > MEDIO_ANCHO + 4 ? 1 : 0.3);
}

export function generadorAleatorio(semilla) {
  let s = semilla >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Cajas flotantes: posición determinista para el índice k
export const SEPARACION_CAJAS = 38;
export const Z_PRIMERA_CAJA = -110;
export function posicionCaja(k) {
  const z = Z_PRIMERA_CAJA - k * SEPARACION_CAJAS;
  const lado = hash(k, 3.1) < 0.5 ? -1 : 1;
  const x = riverX(z) + lado * (2.6 + hash(k, 7.3) * 2.4); // nunca en el centro: hay que ir a por ellas
  return { x, z };
}
