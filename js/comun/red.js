// Transporte entre tele y móviles.
//
// - Modo normal: WebRTC con PeerJS. El servidor público de PeerJS solo presenta a los
//   dispositivos; después los datos viajan directamente por la wifi de casa.
// - Modo local (?local=1): BroadcastChannel entre pestañas del mismo navegador.
//   Sirve para desarrollar en un solo ordenador, sin móvil ni internet.
//
// Ambos modos exponen la misma interfaz:
//   Sala (tele):  crearSala(codigo, { alAbrir, alConectar(con), alError })
//   Mando:        unirseASala(codigo, { alAbrir, alDatos, alCerrar, alError })
//   con:          { id, enviar(obj), alDatos(fn), alCerrar(fn), cerrar() }

import { PREFIJO_SALA } from './protocolo.js';

const URL_PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

export const esLocal = () => new URLSearchParams(location.search).get('local') === '1';

let promesaPeer = null;
function cargarPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  promesaPeer ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = URL_PEERJS;
    s.onload = () => ok(window.Peer);
    s.onerror = () => mal(new Error('No se pudo cargar PeerJS (¿sin internet?)'));
    document.head.append(s);
  });
  return promesaPeer;
}

// ---------------------------------------------------------------------------
// Conexión genérica
// ---------------------------------------------------------------------------
function envoltorio(id, enviarCrudo, cerrarCrudo) {
  const oyentesDatos = [], oyentesCierre = [];
  let cerrada = false;
  const con = {
    id,
    enviar: obj => { if (!cerrada) enviarCrudo(obj); },
    alDatos: fn => oyentesDatos.push(fn),
    alCerrar: fn => oyentesCierre.push(fn),
    cerrar: () => { if (!cerrada) { cerrarCrudo(); con._cerrar(); } },
    _datos: d => oyentesDatos.forEach(fn => fn(d)),
    _cerrar: () => { if (cerrada) return; cerrada = true; oyentesCierre.forEach(fn => fn()); },
  };
  return con;
}

// ---------------------------------------------------------------------------
// Modo local (BroadcastChannel)
// ---------------------------------------------------------------------------
function salaLocal(codigo, h) {
  const canal = new BroadcastChannel(PREFIJO_SALA + codigo);
  const conexiones = new Map();
  canal.onmessage = ({ data }) => {
    if (data.para !== 'sala') return;
    let con = conexiones.get(data.de);
    if (data.tipo === 'abrir' && !con) {
      con = envoltorio(data.de,
        obj => canal.postMessage({ para: data.de, tipo: 'datos', obj }),
        () => canal.postMessage({ para: data.de, tipo: 'cerrar' }));
      conexiones.set(data.de, con);
      con.alCerrar(() => conexiones.delete(data.de));
      canal.postMessage({ para: data.de, tipo: 'aceptada' });
      h.alConectar?.(con);
    } else if (data.tipo === 'datos' && con) con._datos(data.obj);
    else if (data.tipo === 'cerrar' && con) con._cerrar();
  };
  addEventListener('pagehide', () => conexiones.forEach(c => c.cerrar()));
  setTimeout(() => h.alAbrir?.(codigo), 0);
  return { cerrar: () => canal.close() };
}

function mandoLocal(codigo, h) {
  const yo = 'local-' + Math.random().toString(36).slice(2, 10);
  const canal = new BroadcastChannel(PREFIJO_SALA + codigo);
  const con = envoltorio(yo,
    obj => canal.postMessage({ para: 'sala', de: yo, tipo: 'datos', obj }),
    () => canal.postMessage({ para: 'sala', de: yo, tipo: 'cerrar' }));
  con.alDatos(d => h.alDatos?.(d));
  con.alCerrar(() => h.alCerrar?.());
  let aceptada = false;
  canal.onmessage = ({ data }) => {
    if (data.para !== yo) return;
    if (data.tipo === 'aceptada') { aceptada = true; h.alAbrir?.(con); }
    else if (data.tipo === 'datos') con._datos(data.obj);
    else if (data.tipo === 'cerrar') con._cerrar();
  };
  canal.postMessage({ para: 'sala', de: yo, tipo: 'abrir' });
  setTimeout(() => { if (!aceptada) h.alError?.({ tipo: 'sala-no-encontrada' }); }, 3000);
  addEventListener('pagehide', () => con.cerrar());
  return con;
}

// ---------------------------------------------------------------------------
// Modo PeerJS (WebRTC)
// ---------------------------------------------------------------------------
function envolverPeer(conn) {
  const con = envoltorio(conn.peer, obj => conn.send(obj), () => conn.close());
  conn.on('data', d => con._datos(d));
  conn.on('close', () => con._cerrar());
  conn.on('error', () => con._cerrar());
  return con;
}

async function salaPeer(codigo, h) {
  const Peer = await cargarPeerJS();
  const peer = new Peer(PREFIJO_SALA + codigo, { debug: 1 });
  peer.on('open', () => h.alAbrir?.(codigo));
  peer.on('connection', conn => {
    conn.on('open', () => h.alConectar?.(envolverPeer(conn)));
  });
  peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000); });
  peer.on('error', err => h.alError?.({ tipo: err.type === 'unavailable-id' ? 'codigo-ocupado' : err.type, detalle: String(err) }));
  return { cerrar: () => peer.destroy() };
}

async function mandoPeer(codigo, h) {
  const Peer = await cargarPeerJS();
  const peer = new Peer({ debug: 1 });
  let abierta = false;
  peer.on('open', () => {
    const conn = peer.connect(PREFIJO_SALA + codigo, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      abierta = true;
      const con = envolverPeer(conn);
      con.alDatos(d => h.alDatos?.(d));
      con.alCerrar(() => { h.alCerrar?.(); peer.destroy(); });
      h.alAbrir?.(con);
    });
  });
  peer.on('error', err => {
    h.alError?.({ tipo: err.type === 'peer-unavailable' ? 'sala-no-encontrada' : err.type, detalle: String(err) });
    if (!abierta) peer.destroy();
  });
  setTimeout(() => { if (!abierta && !peer.destroyed) { h.alError?.({ tipo: 'tiempo-agotado' }); peer.destroy(); } }, 12000);
}

// ---------------------------------------------------------------------------
export function crearSala(codigo, h) {
  return esLocal() ? salaLocal(codigo, h) : salaPeer(codigo, h);
}
export function unirseASala(codigo, h) {
  return esLocal() ? mandoLocal(codigo, h) : mandoPeer(codigo, h).catch(e => h.alError?.({ tipo: 'carga', detalle: e.message }));
}
