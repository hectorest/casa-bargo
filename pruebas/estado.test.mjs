// Pruebas de la simulación: node pruebas/estado.test.mjs
import assert from 'node:assert/strict';
import { crearEstado, unirJugador, aplicarEntrada, paso, desconectarJugador, quienLlevaTimon, conectados } from '../js/juego/estado.js';
import { riverX, MEDIO_ANCHO } from '../js/comun/rio.js';

const DT = 1 / 30;
function correr(e, segundos, cadaPaso) {
  const ev = [];
  for (let t = 0; t < segundos; t += DT) { cadaPaso?.(e); ev.push(...paso(e, DT)); }
  return ev;
}
const desvioMax = (e, s, f) => { let m = 0; for (let t = 0; t < s; t += DT) { f?.(e); paso(e, DT); m = Math.max(m, Math.abs(e.barco.x - riverX(e.barco.z))); } return m; };

// 1. El piloto automático navega 10 minutos sin tocar la orilla y avanza
{
  const e = crearEstado();
  const z0 = e.barco.z;
  const ev = correr(e, 600);
  const golpes = ev.filter(x => x.tipo === 'golpe').length;
  console.log(`autopiloto: avanzó ${(z0 - e.barco.z).toFixed(0)} u, golpes ${golpes}, cajas ${e.cajasRecogidas.size}`);
  assert.equal(golpes, 0);
  assert.ok(z0 - e.barco.z > 3500);
  assert.ok(e.cajasRecogidas.size < 25, 'el piloto automático no debería recoger casi cajas');
}

// 1b. Un timonel humano razonable puede ir a toda máquina sin apenas rozar
{
  const s = crearEstado(); unirJugador(s, 'h');
  const ev = correr(s, 300, x => {
    const j = x.jugadores.get('h'); j.ultimoLatido = x.tiempo; j.palanca = 1;
    // Mira 12 u por delante y corrige con retraso de humano (reacción cada 0,3 s)
    if (Math.round(x.tiempo / DT) % 9 === 0) {
      const zA = x.barco.z - 12;
      const objetivo = Math.atan2(riverX(zA) - x.barco.x, 12);
      j.giro = Math.max(-1, Math.min(1, (objetivo - x.barco.rumbo) * 3));
    }
  });
  const g = ev.filter(x => x.tipo === 'golpe').length;
  console.log(`humano a toda máquina: ${g} golpes en 5 min`);
  assert.ok(g <= 3);
}

// 2. El primero que llega coge el timón; el segundo es pasajero
const e = crearEstado();
const a = unirJugador(e, 'movil-a').jugador, b = unirJugador(e, 'movil-b').jugador;
assert.equal(a.puesto, 'timon'); assert.equal(b.puesto, 'pasajero');
assert.notEqual(a.color, b.color); assert.equal(a.n, 1); assert.equal(b.n, 2);

// 3. Un pasajero no puede girar
aplicarEntrada(e, 'movil-b', { t: 'timon', giro: 1 });
assert.equal(b.giro, 0);

// 4. Sin tocar el timón y a toda máquina, la corriente acaba llevando a la orilla (y se rebota sin hundirse)
aplicarEntrada(e, 'movil-a', { t: 'velocidad', v: 1 });
const latidos = x => { for (const j of conectados(x)) j.ultimoLatido = x.tiempo; };
const evRapido = correr(e, 120, latidos);
const golpes = evRapido.filter(x => x.tipo === 'golpe');
console.log(`a toda máquina sin timonear: ${golpes.length} golpes en 2 min`);
assert.ok(golpes.length > 0, 'debería costar algo ir rápido sin gobernar');
assert.ok(Math.abs(e.barco.x - riverX(e.barco.z)) <= MEDIO_ANCHO, 'nunca sale del cauce');

// 5. Despacio y sin tocar nada, es fácil: casi sin golpes
aplicarEntrada(e, 'movil-a', { t: 'velocidad', v: 0.35 });
const golpesLento = correr(e, 120, latidos).filter(x => x.tipo === 'golpe').length;
console.log(`despacio sin timonear: ${golpesLento} golpes en 2 min`);
assert.ok(golpesLento < golpes.length);

// 6. Girar a la derecha mueve el barco hacia +x
{
  const s = crearEstado(); unirJugador(s, 'x');
  aplicarEntrada(s, 'x', { t: 'velocidad', v: 0.6 });
  const x0 = s.barco.x - riverX(s.barco.z);
  aplicarEntrada(s, 'x', { t: 'timon', giro: 1 });
  for (let t = 0; t < 1.5; t += DT) { s.jugadores.get('x').ultimoLatido = s.tiempo; paso(s, DT); }
  assert.ok(s.barco.x - riverX(s.barco.z) > x0 + 0.5, 'giro positivo = derecha');
}

// 7. Pedir el timón intercambia puestos
const cambios = aplicarEntrada(e, 'movil-b', { t: 'pedirTimon' });
assert.equal(b.puesto, 'timon'); assert.equal(a.puesto, 'pasajero'); assert.equal(cambios.length, 2);

// 8. Si el timonel se desconecta, el timón pasa a otro; al volver, conserva número y color
desconectarJugador(e, 'movil-b');
assert.equal(quienLlevaTimon(e), a);
const vuelta = unirJugador(e, 'movil-b').jugador;
assert.equal(vuelta.n, 2); assert.equal(vuelta.puesto, 'pasajero');

// 9. Sin latidos durante 5 s se da por desconectado
const ev9 = correr(e, 6);
assert.ok(ev9.some(x => x.tipo === 'desconexion'));
assert.equal(conectados(e).length, 0);
assert.equal(e.barco.autopiloto, true);

// 10. Un timonel atento recoge cajas
{
  const s = crearEstado(); unirJugador(s, 'p');
  const { posicionCaja } = await import('../js/comun/rio.js');
  const ev = correr(s, 240, x => {
    const j = x.jugadores.get('p'); j.ultimoLatido = x.tiempo;
    const k = [...Array(400).keys()].find(k => !x.cajasRecogidas.has(k) && posicionCaja(k).z < x.barco.z);
    const c = posicionCaja(k);
    const objetivo = Math.atan2(c.x - x.barco.x, x.barco.z - c.z);
    j.giro = Math.max(-1, Math.min(1, (objetivo - x.barco.rumbo) * 4));
    j.palanca = 0.5;
  });
  const cajas = ev.filter(x => x.tipo === 'caja').length;
  console.log(`timonel atento: ${cajas} cajas en 4 min`);
  assert.ok(cajas >= 10);
}

console.log('✔ todas las pruebas de estado pasan');
