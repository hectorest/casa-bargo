// Mando del móvil: se conecta a la tele y envía las acciones del jugador.

import { unirseASala, esLocal } from '../comun/red.js';
import { normalizarCodigo } from '../comun/protocolo.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);

// Identificador estable de este móvil: permite volver a la partida con el mismo color.
// En modo local (varias pestañas en un mismo navegador) cada pestaña es un jugador distinto.
const almacen = esLocal() ? sessionStorage : localStorage;
const ID = almacen.getItem('casabarco-id') || (() => {
  const id = 'm-' + Math.random().toString(36).slice(2, 12);
  almacen.setItem('casabarco-id', id);
  return id;
})();

let con = null, codigo = normalizarCodigo(params.get('sala')), puesto = null, reintentoTimer = null;
let generacion = 0; // invalida los avisos de intentos de conexión anteriores

function mostrar(id) { $$('.pantalla').forEach(p => p.classList.toggle('activa', p.id === id)); }

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------
function conectar() {
  clearTimeout(reintentoTimer);
  const yo = ++generacion;
  const vigente = () => yo === generacion;
  mostrar('conectando');
  $('#botonOtroCodigo').style.display = 'none';
  unirseASala(codigo, {
    alAbrir: c => { if (!vigente()) return c.cerrar(); con = c; con.enviar({ t: 'hola', id: ID }); },
    alDatos: m => { if (vigente()) recibir(m); },
    alCerrar: () => {
      if (!vigente()) return;
      con = null;
      $('#mensajeConexion').textContent = 'Se ha perdido la conexión con la tele. Reconectando…';
      mostrar('conectando');
      reintentoTimer = setTimeout(conectar, 2000);
    },
    alError: err => {
      if (!vigente()) return;
      con = null;
      const textos = {
        'sala-no-encontrada': `No encuentro la sala ${codigo}. ¿Está la tele encendida con el juego abierto?`,
        'tiempo-agotado': 'La tele no responde. ¿Estáis en la misma wifi?',
        'carga': 'No se pudo cargar el mando. ¿Hay conexión a internet?',
      };
      $('#mensajeConexion').textContent = (textos[err.tipo] || `Error de conexión (${err.tipo}).`) + ' Reintentando…';
      $('#botonOtroCodigo').style.display = '';
      reintentoTimer = setTimeout(conectar, 3000);
    },
  });
}

function recibir(m) {
  switch (m.t) {
    case 'bienvenida':
      document.documentElement.style.setProperty('--color', m.color);
      $('.quien').textContent = `Jugador ${m.n}`;
      ponerPuesto(m.puesto);
      mostrar('juego');
      break;
    case 'puesto': ponerPuesto(m.puesto); vibrar([40, 60, 40]); break;
    case 'golpe': vibrar(40 + m.fuerza * 140); destello(m.fuerza); break;
    case 'caja': $('#contadorCajas').textContent = `📦 ${m.total}`; vibrar([25, 40, 25]); break;
    case 'aviso': $('#mensajeConexion').textContent = m.texto; break;
  }
}

const enviar = m => con?.enviar(m);
setInterval(() => enviar({ t: 'latido' }), 1000);

// ---------------------------------------------------------------------------
// Puestos
// ---------------------------------------------------------------------------
function ponerPuesto(p) {
  puesto = p;
  $('#etiquetaPuesto').textContent = p === 'timon' ? '☸ Timón' : '🧺 Pasajero';
  $('#zonaTimon').classList.toggle('activa', p === 'timon');
  $('#zonaPasajero').classList.toggle('activa', p !== 'timon');
  $('#pieTimon').style.display = p === 'timon' ? '' : 'none';
  if (p === 'timon') { enviar({ t: 'velocidad', v: palanca }); giroEnviado = null; }
}

$$('[data-bocina]').forEach(b => b.addEventListener('pointerdown', () => { enviar({ t: 'bocina' }); vibrar(30); }));
$('#botonPedirTimon').addEventListener('click', () => enviar({ t: 'pedirTimon' }));

// ---------------------------------------------------------------------------
// Timón: arrastrar con el dedo o inclinar el móvil
// ---------------------------------------------------------------------------
const GIRO_MAX_GRADOS = 135; // la rueda gira hasta ±135° visualmente
let giro = 0, giroEnviado = null, modo = localStorage.getItem('casabarco-modo') || 'arrastrar';
let arrastre = null; // { anguloInicio, giroInicio }
let inclinacionRecibida = false, ultimaInclinacion = 0;

function angulo(e) {
  const r = $('#rueda').getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
}
$('#rueda').addEventListener('pointerdown', e => {
  if (modo !== 'arrastrar') return;
  $('#rueda').setPointerCapture(e.pointerId);
  arrastre = { anguloInicio: angulo(e), giroInicio: giro };
});
$('#rueda').addEventListener('pointermove', e => {
  if (!arrastre) return;
  let d = angulo(e) - arrastre.anguloInicio;
  d = ((d + 540) % 360) - 180; // normaliza a [-180, 180]
  giro = Math.max(-1, Math.min(1, arrastre.giroInicio + d / GIRO_MAX_GRADOS));
});
const soltar = () => { arrastre = null; };
$('#rueda').addEventListener('pointerup', soltar);
$('#rueda').addEventListener('pointercancel', soltar);

// Inclinación: ángulo del "arriba" del mundo visto en el plano de la pantalla.
// Funciona con el móvil de pie (como un volante) o tumbado (como una bandeja).
function alOrientar(ev) {
  if (ev.beta == null || ev.gamma == null) return;
  inclinacionRecibida = true;
  const b = ev.beta * Math.PI / 180, g = ev.gamma * Math.PI / 180;
  const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);
  const th = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
  const sx = ux * Math.cos(th) - uy * Math.sin(th);
  const sy = ux * Math.sin(th) + uy * Math.cos(th);
  const grados = Math.atan2(sx, Math.abs(sy) + 0.5) * 180 / Math.PI;
  ultimaInclinacion = -grados;
}
function giroDesdeInclinacion() {
  const g = ultimaInclinacion, zonaMuerta = 3, maximo = 35;
  if (Math.abs(g) < zonaMuerta) return 0;
  return Math.max(-1, Math.min(1, Math.sign(g) * (Math.abs(g) - zonaMuerta) / (maximo - zonaMuerta)));
}

const pidePermiso = () => typeof window.DeviceOrientationEvent?.requestPermission === 'function';

async function ponerModo(m) {
  modo = m;
  localStorage.setItem('casabarco-modo', m);
  $$('.modos button').forEach(b => b.classList.toggle('on', b.dataset.modo === m));
  $('#avisoInclinar').textContent = m === 'inclinar' ? 'Gira el móvil como un volante' : 'Arrastra la rueda con el dedo';
  if (m !== 'inclinar') return;
  // iPhone pide permiso explícito, y solo tras una pulsación
  if (pidePermiso()) {
    try {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error();
    } catch {
      $('#avisoInclinar').textContent = 'Sin permiso para usar la inclinación. Pulsa de nuevo "Inclinar" para pedirlo.';
      return;
    }
  }
  addEventListener('deviceorientation', alOrientar);
  setTimeout(() => {
    if (modo === 'inclinar' && !inclinacionRecibida) $('#avisoInclinar').textContent = 'Este móvil no informa de la inclinación: usa "Arrastrar".';
  }, 1500);
}
$$('.modos button').forEach(b => b.addEventListener('click', () => ponerModo(b.dataset.modo)));

// Palanca de máquina
let palanca = Number(localStorage.getItem('casabarco-palanca') ?? 0.65);
function ponerPalanca(v) {
  palanca = v;
  localStorage.setItem('casabarco-palanca', v);
  $$('#palanca [data-v]').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === v));
  enviar({ t: 'velocidad', v });
}
$$('#palanca [data-v]').forEach(b => b.addEventListener('click', () => { ponerPalanca(Number(b.dataset.v)); vibrar(15); }));

// Bucle del mando: animación de la rueda y envío del giro (máx. 20 veces/s)
let ultimoEnvio = 0, ultimoFrame = performance.now();
function bucle(ahora) {
  requestAnimationFrame(bucle);
  const dt = Math.min(0.1, (ahora - ultimoFrame) / 1000); ultimoFrame = ahora;
  if (modo === 'inclinar' && inclinacionRecibida) giro = giroDesdeInclinacion();
  else if (!arrastre) giro *= Math.max(0, 1 - dt * 5); // al soltar, la rueda vuelve sola al centro
  if (Math.abs(giro) < 0.01 && !arrastre) giro = 0;
  $('#ruedaGiro').setAttribute('transform', `rotate(${(giro * GIRO_MAX_GRADOS).toFixed(1)})`);
  if (puesto === 'timon' && ahora - ultimoEnvio > 50 && (giroEnviado === null || Math.abs(giro - giroEnviado) > 0.015 || (giro === 0 && giroEnviado !== 0))) {
    enviar({ t: 'timon', giro: Math.round(giro * 1000) / 1000 });
    giroEnviado = giro; ultimoEnvio = ahora;
  }
}
requestAnimationFrame(bucle);

// ---------------------------------------------------------------------------
// Detalles: vibración, destello, pantalla siempre encendida
// ---------------------------------------------------------------------------
function vibrar(p) { try { navigator.vibrate?.(p); } catch {} }
function destello(f) { const el = $('#flash'); el.style.opacity = String(0.15 + f * 0.35); setTimeout(() => el.style.opacity = '0', 120); }

let bloqueoPantalla = null;
async function mantenerEncendida() {
  try { if (!bloqueoPantalla && document.visibilityState === 'visible') { bloqueoPantalla = await navigator.wakeLock?.request('screen'); bloqueoPantalla?.addEventListener('release', () => bloqueoPantalla = null); } } catch {}
}
addEventListener('pointerdown', mantenerEncendida);
document.addEventListener('visibilitychange', mantenerEncendida);

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
$('#botonEntrar').addEventListener('click', () => {
  codigo = normalizarCodigo($('#inputCodigo').value);
  if (codigo.length !== 4) { $('#inputCodigo').focus(); return; }
  const u = new URL(location.href); u.searchParams.set('sala', codigo); history.replaceState(null, '', u);
  conectar();
});
$('#inputCodigo').addEventListener('keydown', e => { if (e.key === 'Enter') $('#botonEntrar').click(); });
$('#botonOtroCodigo').addEventListener('click', () => { clearTimeout(reintentoTimer); generacion++; const c = con; con = null; c?.cerrar(); mostrar('entrar'); $('#inputCodigo').value = ''; });

// En iPhone el permiso exige una pulsación, así que se arranca en "arrastrar" y el jugador elige.
ponerModo(modo === 'inclinar' && pidePermiso() ? 'arrastrar' : modo);
ponerPalanca(palanca);
if (codigo.length === 4) conectar(); else mostrar('entrar');
