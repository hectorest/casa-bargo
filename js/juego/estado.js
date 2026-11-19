// Simulación del juego: pura, sin gráficos ni red, para poder probarla aislada.
// La tele es la autoridad: recibe entradas de los mandos, avanza el estado y la escena lo dibuja.

import { MEDIO_ANCHO, riverX, riverRumbo, riverCurvatura, posicionCaja, SEPARACION_CAJAS, Z_PRIMERA_CAJA } from '../comun/rio.js';

export const COLORES = ['#e8a33d', '#5bb0d8', '#e06c8c', '#7cc46a', '#b48be0', '#f2d15c', '#ef8354', '#4ecdc4'];
export const MAX_JUGADORES = 8;
export const VEL_MAX = 13;          // unidades/s con la palanca a tope
export const VEL_AUTOPILOTO = 7;
export const TIEMPO_DESCONEXION = 5; // s sin latido para dar a alguien por desconectado

const LIMITE_ORILLA = MEDIO_ANCHO - 1.8; // el casco mide ~1.7 de medio ancho

export function crearEstado() {
  const z = -60;
  return {
    tiempo: 0,
    barco: { x: riverX(z), z, rumbo: riverRumbo(z), vel: VEL_AUTOPILOTO, giro: 0, palanca: 0.55, golpe: 0, autopiloto: true },
    jugadores: new Map(), // id → jugador
    cajasRecogidas: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Jugadores y puestos
// ---------------------------------------------------------------------------
export const conectados = e => [...e.jugadores.values()].filter(j => j.conectado);
export const quienLlevaTimon = e => conectados(e).find(j => j.puesto === 'timon') ?? null;

/** Alta o regreso de un jugador. Devuelve { jugador, cambios } o { error }. */
export function unirJugador(e, id) {
  let j = e.jugadores.get(id);
  if (!j) {
    if (e.jugadores.size >= MAX_JUGADORES) {
      // Reutiliza la plaza de alguien desconectado
      const libre = [...e.jugadores.values()].find(x => !x.conectado);
      if (!libre) return { error: 'barco-lleno' };
      e.jugadores.delete(libre.id);
    }
    const usados = new Set([...e.jugadores.values()].map(x => x.n));
    let n = 1; while (usados.has(n)) n++;
    j = { id, n, color: COLORES[(n - 1) % COLORES.length], puesto: 'pasajero', conectado: true, ultimoLatido: e.tiempo, giro: 0, palanca: 0.55 };
    e.jugadores.set(id, j);
  }
  j.conectado = true;
  j.ultimoLatido = e.tiempo;
  const timonel = quienLlevaTimon(e);
  if (!timonel) j.puesto = 'timon';
  else if (timonel !== j) j.puesto = 'pasajero';
  return { jugador: j };
}

export function desconectarJugador(e, id) {
  const j = e.jugadores.get(id);
  if (!j || !j.conectado) return [];
  j.conectado = false;
  const cambios = [];
  if (j.puesto === 'timon') {
    j.puesto = 'pasajero';
    // Pasa el timón al primer pasajero conectado, si lo hay
    const siguiente = conectados(e).sort((a, b) => a.n - b.n)[0];
    if (siguiente) { siguiente.puesto = 'timon'; cambios.push(siguiente); }
  }
  return cambios;
}

/** Un pasajero pide el timón: se intercambian los puestos. Devuelve los jugadores cambiados. */
export function pedirTimon(e, id) {
  const j = e.jugadores.get(id);
  if (!j || !j.conectado || j.puesto === 'timon') return [];
  const actual = quienLlevaTimon(e);
  j.puesto = 'timon';
  if (actual) { actual.puesto = 'pasajero'; actual.giro = 0; return [j, actual]; }
  return [j];
}

/** Aplica un mensaje de un mando. Devuelve eventos para la tele (sonidos, avisos). */
export function aplicarEntrada(e, id, m) {
  const j = e.jugadores.get(id);
  if (!j) return [];
  j.ultimoLatido = e.tiempo;
  switch (m.t) {
    case 'timon':
      if (j.puesto === 'timon') j.giro = Math.max(-1, Math.min(1, Number(m.giro) || 0));
      return [];
    case 'velocidad':
      if (j.puesto === 'timon') j.palanca = Math.max(0, Math.min(1, Number(m.v) || 0));
      return [];
    case 'bocina':
      return [{ tipo: 'bocina', jugador: j }];
    case 'pedirTimon':
      return pedirTimon(e, id).map(x => ({ tipo: 'puesto', jugador: x }));
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Avance del tiempo
// ---------------------------------------------------------------------------
const diferenciaAngulo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Avanza la simulación dt segundos. Devuelve eventos: golpe, caja, desconexión. */
export function paso(e, dt) {
  e.tiempo += dt;
  const b = e.barco;
  const eventos = [];

  // Desconexiones por falta de latido
  for (const j of conectados(e)) {
    if (e.tiempo - j.ultimoLatido > TIEMPO_DESCONEXION) {
      const cambios = desconectarJugador(e, j.id);
      eventos.push({ tipo: 'desconexion', jugador: j });
      cambios.forEach(x => eventos.push({ tipo: 'puesto', jugador: x }));
    }
  }

  // ¿Quién gobierna?
  const timonel = quienLlevaTimon(e);
  b.autopiloto = !timonel;
  const rumboRio = riverRumbo(b.z);
  const desvio = b.x - riverX(b.z);
  let objetivoVel;
  if (timonel) {
    b.giro = timonel.giro;
    b.palanca = timonel.palanca;
    objetivoVel = b.palanca * VEL_MAX;
  } else {
    // Piloto automático: apunta un poco hacia el centro y navega tranquilo
    const rumboDeseado = rumboRio - Math.max(-0.4, Math.min(0.4, desvio * 0.08));
    b.giro = Math.max(-1, Math.min(1, diferenciaAngulo(rumboDeseado, b.rumbo) * 3));
    b.palanca = VEL_AUTOPILOTO / VEL_MAX;
    objetivoVel = VEL_AUTOPILOTO;
  }

  // Velocidad con inercia
  b.vel += (objetivoVel - b.vel) * Math.min(1, dt * 0.7);

  // Giro: hace falta avanzar para girar
  const agarre = 0.25 + 0.75 * Math.min(1, b.vel / 6);
  b.rumbo += b.giro * 0.75 * agarre * dt;
  // La corriente ayuda suavemente a alinearse con el río
  b.rumbo += diferenciaAngulo(rumboRio, b.rumbo) * Math.min(1, dt * 0.35);

  // Movimiento + empuje hacia fuera en las curvas (más fuerte cuanto más rápido)
  b.x += Math.sin(b.rumbo) * b.vel * dt;
  b.z -= Math.cos(b.rumbo) * b.vel * dt;
  b.x -= riverCurvatura(b.z) * b.vel * b.vel * 2.2 * dt;

  // Orillas: rebote suave, nunca hundimiento
  b.golpe = Math.max(0, b.golpe - dt * 2);
  const nuevoDesvio = b.x - riverX(b.z);
  if (Math.abs(nuevoDesvio) > LIMITE_ORILLA) {
    const lado = Math.sign(nuevoDesvio);
    b.x = riverX(b.z) + lado * LIMITE_ORILLA;
    const haciaFuera = diferenciaAngulo(b.rumbo, rumboRio) * lado; // >0 si apunta hacia la orilla
    if (haciaFuera > 0) b.rumbo = rumboRio - lado * 0.08;
    const fuerza = Math.min(1, (b.vel / VEL_MAX) * (0.4 + haciaFuera * 2));
    if (b.golpe === 0 && b.vel > 2) {
      eventos.push({ tipo: 'golpe', fuerza, jugador: timonel });
      b.golpe = 1;
    }
    b.vel *= 1 - Math.min(0.9, dt * 3);
  }

  // Cajas flotantes cercanas
  const k0 = Math.max(0, Math.floor((Z_PRIMERA_CAJA - b.z) / SEPARACION_CAJAS) - 1);
  for (let k = k0; k < k0 + 3; k++) {
    if (e.cajasRecogidas.has(k)) continue;
    const c = posicionCaja(k);
    if (Math.hypot(c.x - b.x, c.z - b.z) < 2.2) {
      e.cajasRecogidas.add(k);
      eventos.push({ tipo: 'caja', k, total: e.cajasRecogidas.size, jugador: timonel });
    }
  }

  return eventos;
}
