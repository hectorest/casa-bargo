// Tele: crea la sala, recibe a los mandos, avanza la simulación y dibuja.

import { crearEscena } from './escena.js';
import { crearSala, esLocal } from '../comun/red.js';
import { codigoAleatorio } from '../comun/protocolo.js';
import { crearEstado, unirJugador, desconectarJugador, aplicarEntrada, paso, conectados, quienLlevaTimon } from '../juego/estado.js';
import { crearSonidos } from './sonidos.js';

const params = new URLSearchParams(location.search);
const $ = sel => document.querySelector(sel);

const estado = crearEstado();
const escena = crearEscena(document.body);
escena.ponerCalidad(params.get('q') || 'medio');
const sonidos = crearSonidos();

// ---------------------------------------------------------------------------
// Sala y conexiones
// ---------------------------------------------------------------------------
const conexiones = new Map(); // id de jugador → conexión
const enviarA = (j, m) => j && conexiones.get(j.id)?.enviar(m);
const enviarATodos = m => conexiones.forEach(c => c.enviar(m));

function avisarPuesto(j) { enviarA(j, { t: 'puesto', puesto: j.puesto }); }

function alConectar(con) {
  let id = null;
  con.alDatos(m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hola') {
      id = String(m.id || con.id).slice(0, 64);
      const anterior = conexiones.get(id);
      if (anterior && anterior !== con) anterior.cerrar();
      const r = unirJugador(estado, id);
      if (r.error) { con.enviar({ t: 'aviso', texto: 'El barco está lleno 🙈' }); con.cerrar(); return; }
      conexiones.set(id, con);
      const j = r.jugador;
      con.enviar({ t: 'bienvenida', n: j.n, color: j.color, puesto: j.puesto });
      // Si al entrar alguien ha perdido el timón (no debería), avisamos a todos de su puesto
      conectados(estado).forEach(avisarPuesto);
      aviso(`<span class="punto" style="background:${j.color}"></span> Jugador ${j.n} sube a bordo`);
      sonidos.campana();
      escena.saltar(j.n);
      return;
    }
    if (!id) return;
    for (const ev of aplicarEntrada(estado, id, m)) manejarEvento(ev);
  });
  con.alCerrar(() => {
    if (!id || conexiones.get(id) !== con) return;
    conexiones.delete(id);
    const j = estado.jugadores.get(id);
    const cambios = desconectarJugador(estado, id);
    if (j) aviso(`Jugador ${j.n} se ha bajado`);
    cambios.forEach(x => manejarEvento({ tipo: 'puesto', jugador: x }));
  });
}

function manejarEvento(ev) {
  switch (ev.tipo) {
    case 'golpe':
      sonidos.golpe(ev.fuerza);
      enviarA(ev.jugador, { t: 'golpe', fuerza: ev.fuerza });
      break;
    case 'caja':
      sonidos.caja();
      enviarATodos({ t: 'caja', total: ev.total });
      aviso(`📦 ¡Caja recogida! Ya van ${ev.total}`);
      break;
    case 'bocina':
      sonidos.bocina();
      escena.saltar(ev.jugador.n);
      break;
    case 'puesto':
      avisarPuesto(ev.jugador);
      if (ev.jugador.puesto === 'timon') aviso(`<span class="punto" style="background:${ev.jugador.color}"></span> Jugador ${ev.jugador.n} lleva el timón`);
      break;
    case 'desconexion':
      conexiones.get(ev.jugador.id)?.cerrar();
      break;
  }
}

let codigo = sessionStorage.getItem('casabarco-codigo') || codigoAleatorio();
function abrirSala(intentos = 0) {
  sessionStorage.setItem('casabarco-codigo', codigo);
  $('#estadoSala').textContent = 'Abriendo sala…';
  crearSala(codigo, {
    alAbrir: () => { mostrarQR(); $('#estadoSala').textContent = ''; },
    alConectar,
    alError: err => {
      if (err.tipo === 'codigo-ocupado' && intentos < 5) { codigo = codigoAleatorio(); abrirSala(intentos + 1); return; }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.tipo)) {
        $('#estadoSala').textContent = 'Sin conexión con el servidor de salas. Reintentando…';
        return;
      }
      console.warn(err);
    },
  });
}

// ---------------------------------------------------------------------------
// Interfaz: QR, lista de jugadores, avisos
// ---------------------------------------------------------------------------
function urlMando() {
  const u = new URL('mando/', location.href);
  u.search = '';
  u.searchParams.set('sala', codigo);
  if (esLocal()) u.searchParams.set('local', '1');
  return u.href;
}

async function mostrarQR() {
  $('#codigo').textContent = codigo;
  const url = urlMando();
  $('#urlMando').textContent = url.replace(/^https?:\/\//, '');
  if (location.protocol === 'file:') {
    $('#estadoSala').textContent = '⚠ Abre el juego desde su dirección web (GitHub Pages) para que los móviles puedan entrar.';
  }
  try {
    await cargarScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(url); qr.make();
    const n = qr.getModuleCount(), celda = 6, margen = 3, lado = (n + margen * 2) * celda;
    const cv = $('#qr'); cv.width = cv.height = lado;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = '#173543';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + margen) * celda, (r + margen) * celda, celda, celda);
  } catch { $('#qr').style.display = 'none'; }
}

function cargarScript(src) {
  return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.head.append(s); });
}

function pintarJugadores() {
  const js = conectados(estado).sort((a, b) => a.n - b.n);
  $('#jugadores').innerHTML = js.length
    ? js.map(j => `<li><span class="punto" style="background:${j.color}"></span>Jugador ${j.n}<em>${j.puesto === 'timon' ? '☸ Timón' : '🧺 Pasajero'}</em></li>`).join('')
    : '<li class="vacio">Nadie a bordo todavía</li>';
  $('#panel').classList.toggle('compacto', js.length > 0);
  $('#piloto').style.display = quienLlevaTimon(estado) ? 'none' : 'block';
  $('#cajas').textContent = `📦 ${estado.cajasRecogidas.size}`;
}

function aviso(html) {
  const el = document.createElement('div');
  el.className = 'aviso'; el.innerHTML = html;
  $('#avisos').append(el);
  setTimeout(() => el.classList.add('fuera'), 3200);
  setTimeout(() => el.remove(), 3800);
}

// Sonido: los navegadores exigen una pulsación antes de reproducir audio
const desbloquear = () => sonidos.activar().then(ok => { if (ok) $('#sonido').style.display = 'none'; });
addEventListener('click', desbloquear);
addEventListener('keydown', e => {
  desbloquear();
  if (e.key === '1') escena.ponerCalidad('bajo');
  if (e.key === '2') escena.ponerCalidad('medio');
  if (e.key === '3') escena.ponerCalidad('alto');
  if (e.key === 'd' || e.key === 'D') $('#depuracion').classList.toggle('visible');
});
if (params.get('debug') === '1') $('#depuracion').classList.add('visible');

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------
let ultimo = performance.now(), acumuladoUI = 0;
const tiemposFrame = [];
function frame(ahora) {
  requestAnimationFrame(frame);
  const ms = Math.min(100, ahora - ultimo); ultimo = ahora;
  const dt = ms / 1000;
  for (const ev of paso(estado, dt)) manejarEvento(ev);
  escena.dibujar(estado, dt, conectados(estado));

  tiemposFrame.push(ms); if (tiemposFrame.length > 60) tiemposFrame.shift();
  acumuladoUI += dt;
  if (acumuladoUI > 0.25) {
    acumuladoUI = 0;
    pintarJugadores();
    if ($('#depuracion').classList.contains('visible')) {
      const fps = 1000 / (tiemposFrame.reduce((a, b) => a + b, 0) / tiemposFrame.length);
      const i = escena.info(), b = estado.barco;
      $('#depuracion').textContent = `${fps.toFixed(0)} FPS · ${i.calls} draw calls · ${(i.triangulos / 1000).toFixed(1)}k tri\n` +
        `vel ${b.vel.toFixed(1)} · giro ${b.giro.toFixed(2)} · ${b.autopiloto ? 'piloto automático' : 'timón manual'}\n` +
        `${esLocal() ? 'modo local' : 'WebRTC'} · conexiones ${conexiones.size}\n${i.gpu.slice(0, 60)}`;
    }
  }
}
requestAnimationFrame(frame);
abrirSala();
