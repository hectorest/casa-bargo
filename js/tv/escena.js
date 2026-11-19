// Escena 3D de la tele (Three.js). Solo dibuja: lee el estado de la simulación, no lo cambia.

import * as THREE from 'three';
import { MEDIO_ANCHO, riverX, ruido, alturaTerreno, generadorAleatorio, posicionCaja, SEPARACION_CAJAS, Z_PRIMERA_CAJA } from '../comun/rio.js';

export const CALIDADES = {
  bajo:  { altoRender: 540,  densidad: 0.5, sombras: false, tramos: 4, nieblaLejos: 150 },
  medio: { altoRender: 720,  densidad: 1.0, sombras: false, tramos: 5, nieblaLejos: 190 },
  alto:  { altoRender: 1080, densidad: 1.5, sombras: true,  tramos: 6, nieblaLejos: 230 },
};
const MAX_TRAMOS = 6, LARGO_TRAMO = 48, ANCHO = 150, SEG_X = 30, SEG_Z = 10;
const MAX_ARBOLES = 70, MAX_ROCAS = 10;

// Puntos de cubierta donde se colocan los muñequitos (coordenadas locales del barco; proa hacia -z)
const SITIO_TIMON = new THREE.Vector3(0.85, 0.75, -1.45);
const SITIOS_PASAJERO = [[-1.1, 3.0], [1.1, 3.0], [0, 3.35], [-1.15, -1.5], [-1.2, 1.4], [1.2, 1.4], [0.6, -3.0]]
  .map(([x, z]) => new THREE.Vector3(x, 0.75, z));

export function crearEscena(contenedor) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  contenedor.prepend(renderer.domElement);

  const CIELO = new THREE.Color('#9fc7d8');
  const scene = new THREE.Scene();
  scene.background = CIELO;
  scene.fog = new THREE.Fog(CIELO, 40, 190);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 400);

  scene.add(new THREE.HemisphereLight('#fff6e0', '#4a6b3a', 1.6));
  const sol = new THREE.DirectionalLight('#fff1d0', 2.2);
  sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  sol.shadow.camera.updateProjectionMatrix();
  scene.add(sol, sol.target);

  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

  // ---------------------------------------------------------------- terreno
  const matTerreno = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const matCopa = lambert('#4f8a4a'), matTronco = lambert('#7a5636'), matRoca = lambert('#8d8f86');
  const geoCopa = new THREE.ConeGeometry(1.6, 4, 6); geoCopa.translate(0, 3.6, 0);
  const geoTronco = new THREE.CylinderGeometry(0.25, 0.35, 1.8, 5); geoTronco.translate(0, 0.9, 0);
  const geoRoca = new THREE.DodecahedronGeometry(1, 0);
  const ARENA = new THREE.Color('#d9c48f'), HIERBA = new THREE.Color('#79a85a'),
        OSCURO = new THREE.Color('#5a8a48'), LECHO = new THREE.Color('#6b7f6a');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), esc = new THREE.Vector3(), p3 = new THREE.Vector3(), arriba = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

  let calidad = 'medio';

  function crearTramo() {
    const geo = new THREE.PlaneGeometry(ANCHO, LARGO_TRAMO, SEG_X, SEG_Z).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const base = Float32Array.from(geo.attributes.position.array);
    const suelo = new THREE.Mesh(geo, matTerreno); suelo.receiveShadow = true;
    const copas = new THREE.InstancedMesh(geoCopa, matCopa, MAX_ARBOLES);
    const troncos = new THREE.InstancedMesh(geoTronco, matTronco, MAX_ARBOLES);
    const rocas = new THREE.InstancedMesh(geoRoca, matRoca, MAX_ROCAS);
    for (const m of [copas, troncos, rocas]) { m.castShadow = true; m.frustumCulled = false; }
    const grupo = new THREE.Group(); grupo.add(suelo, copas, troncos, rocas); scene.add(grupo);
    return { grupo, suelo, copas, troncos, rocas, base, indice: null };
  }

  function construirTramo(t, indice) {
    t.indice = indice;
    const zc = -indice * LARGO_TRAMO - LARGO_TRAMO / 2;
    t.grupo.position.set(0, 0, zc);
    const pos = t.suelo.geometry.attributes.position, colores = t.suelo.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = t.base[i * 3], z = t.base[i * 3 + 2] + zc;
      const y = alturaTerreno(x, z);
      pos.setY(i, y);
      const d = Math.abs(x - riverX(z));
      if (y < -1.2) col.copy(LECHO);
      else if (d < MEDIO_ANCHO + 3) col.copy(ARENA);
      else col.copy(HIERBA).lerp(OSCURO, ruido(x * 0.1, z * 0.1));
      colores.setXYZ(i, col.r, col.g, col.b);
    }
    pos.needsUpdate = colores.needsUpdate = true;
    t.suelo.geometry.computeVertexNormals();

    const r = generadorAleatorio(indice * 9973 + 17);
    const dens = CALIDADES[calidad].densidad;
    const nArboles = Math.round(MAX_ARBOLES * dens / 1.5);
    let n = 0;
    for (let intentos = 0; n < nArboles && intentos < nArboles * 4; intentos++) {
      const z = zc + (r() - 0.5) * LARGO_TRAMO;
      const x = riverX(z) + (r() < 0.5 ? -1 : 1) * (MEDIO_ANCHO + 5 + r() * 60);
      if (Math.abs(x) > ANCHO / 2) continue;
      const s = 0.7 + r() * 0.8;
      m4.compose(p3.set(x, alturaTerreno(x, z) - 0.2, z - zc), q.setFromAxisAngle(arriba, r() * Math.PI), esc.set(s, s * (0.8 + r() * 0.5), s));
      t.copas.setMatrixAt(n, m4); t.troncos.setMatrixAt(n, m4); n++;
    }
    t.copas.count = t.troncos.count = n;
    const nRocas = Math.round(MAX_ROCAS * dens / 1.5);
    for (let k = 0; k < nRocas; k++) {
      const z = zc + (r() - 0.5) * LARGO_TRAMO;
      const x = riverX(z) + (r() < 0.5 ? -1 : 1) * (MEDIO_ANCHO + 0.5 + r() * 5); // en la orilla, no en el agua
      const s = 0.4 + r() * 0.9;
      m4.compose(p3.set(x, alturaTerreno(x, z) + 0.1, z - zc), q.setFromAxisAngle(arriba, r() * Math.PI), esc.set(s, s * 0.7, s));
      t.rocas.setMatrixAt(k, m4);
    }
    t.rocas.count = nRocas;
    for (const m of [t.copas, t.troncos, t.rocas]) m.instanceMatrix.needsUpdate = true;
  }
  const tramos = Array.from({ length: MAX_TRAMOS }, crearTramo);

  // ---------------------------------------------------------------- agua
  const geoAgua = new THREE.PlaneGeometry(200, 320, 40, 80); geoAgua.rotateX(-Math.PI / 2);
  const matAgua = lambert('#3f8fb0', { transparent: true, opacity: 0.88 });
  const tiempoAgua = { value: 0 };
  matAgua.onBeforeCompile = sh => {
    sh.uniforms.uTime = tiempoAgua;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      transformed.y += sin(wp.x * 0.45 + uTime * 1.3) * 0.12 + cos(wp.z * 0.38 + uTime * 1.1) * 0.12;`);
  };
  const agua = new THREE.Mesh(geoAgua, matAgua); agua.receiveShadow = true; scene.add(agua);

  // ---------------------------------------------------------------- barco
  const caja = (w, h, d, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, y, z); m.castShadow = true; return m;
  };
  const barco = new THREE.Group();
  barco.add(
    caja(3.2, 0.8, 7, '#8a5a3b', 0, 0.2, 0),         // casco
    caja(3.4, 0.15, 7.2, '#c9a46c', 0, 0.65, 0),     // cubierta
    caja(2.4, 1.6, 3.4, '#e9dcc3', 0, 1.5, 0.6),     // cabina
    caja(2.8, 0.2, 4, '#b5523b', 0, 2.4, 0.6),       // tejado
    caja(0.35, 1.2, 0.35, '#3d3d3d', 0.7, 3.0, 1.6), // chimenea
    caja(1.4, 0.4, 1, '#6f9a4f', -0.6, 0.95, -2.4),  // huerto
  );
  const rueda = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 5, 10), lambert('#6b4226'));
  rueda.position.set(0.85, 1.55, -1.15); barco.add(rueda);
  scene.add(barco);

  // Muñequitos de los jugadores
  const geoCuerpo = new THREE.CylinderGeometry(0.28, 0.36, 0.9, 6); geoCuerpo.translate(0, 0.45, 0);
  const geoCabeza = new THREE.IcosahedronGeometry(0.27, 0); geoCabeza.translate(0, 1.15, 0);
  const matCabeza = lambert('#f1d1b5');
  const munecos = Array.from({ length: 8 }, () => {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(geoCuerpo, lambert('#ffffff')); cuerpo.castShadow = true;
    const cabeza = new THREE.Mesh(geoCabeza, matCabeza); cabeza.castShadow = true;
    g.add(cuerpo, cabeza); g.visible = false; barco.add(g);
    return { g, cuerpo, salto: 0 };
  });

  // Humo
  const humo = [];
  const matHumo = lambert('#f0f0f0', { transparent: true, opacity: 0.7 });
  const geoHumo = new THREE.IcosahedronGeometry(0.3, 0);
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(geoHumo, matHumo); s.userData.t = i / 8; scene.add(s); humo.push(s); }

  // Cajas flotantes
  const geoCajaF = new THREE.BoxGeometry(1, 1, 1);
  const matCajaF = lambert('#c98b4a');
  const cajasF = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(geoCajaF, matCajaF); m.castShadow = true; scene.add(m); return m; });

  // ---------------------------------------------------------------- calidad
  function ponerCalidad(nombre) {
    calidad = CALIDADES[nombre] ? nombre : 'medio';
    const c = CALIDADES[calidad];
    renderer.setPixelRatio(c.altoRender / innerHeight);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.shadowMap.enabled = c.sombras;
    sol.castShadow = c.sombras;
    scene.fog.far = c.nieblaLejos;
    camera.aspect = innerWidth / innerHeight;
    camera.far = c.nieblaLejos + 10; camera.updateProjectionMatrix();
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    for (const t of tramos) t.indice = null;
  }
  addEventListener('resize', () => ponerCalidad(calidad));

  // ---------------------------------------------------------------- dibujar
  const posCamara = new THREE.Vector3(), mirar = new THREE.Vector3(), posChimenea = new THREE.Vector3();
  let iniciada = false;

  function dibujar(estado, dt, jugadores) {
    const t = estado.tiempo, b = estado.barco;
    const c = CALIDADES[calidad];

    // Barco: balanceo suave + sacudida al rozar
    const sacudida = b.golpe * b.golpe;
    barco.position.set(b.x + Math.sin(t * 40) * 0.08 * sacudida, Math.sin(t * 1.6) * 0.08, b.z);
    barco.rotation.set(Math.sin(t * 1.2) * 0.025, -b.rumbo, Math.sin(t * 0.9) * 0.03 - b.giro * 0.04 + Math.sin(t * 33) * 0.05 * sacudida);
    rueda.rotation.set(0, 0, -b.giro * 2.4);
    barco.updateMatrixWorld();

    // Muñequitos
    let iPasajero = 0;
    munecos.forEach((m, i) => {
      const j = jugadores.find(x => x.n === i + 1);
      m.g.visible = !!j;
      if (!j) return;
      m.cuerpo.material.color.set(j.color);
      const sitio = j.puesto === 'timon' ? SITIO_TIMON : SITIOS_PASAJERO[iPasajero++ % SITIOS_PASAJERO.length];
      m.salto = Math.max(0, m.salto - dt * 3);
      m.g.position.set(sitio.x, sitio.y + Math.sin(m.salto * Math.PI) * 0.6, sitio.z);
      m.g.rotation.y = j.puesto === 'timon' ? 0 : Math.PI;
    });

    // Humo
    posChimenea.set(0.7, 3.6, 1.6).applyMatrix4(barco.matrixWorld);
    for (const s of humo) {
      s.userData.t = (s.userData.t + dt * 0.35) % 1;
      const k = s.userData.t;
      s.position.set(posChimenea.x + k * 1.5, posChimenea.y + k * 3.5, posChimenea.z + k * 3);
      s.scale.setScalar(0.6 + k * 2.2);
    }

    // Tramos de terreno: el tramo j vive siempre en la ranura j % n
    const primero = Math.max(0, Math.floor(-b.z / LARGO_TRAMO) - 1);
    for (let i = 0; i < MAX_TRAMOS; i++) tramos[i].grupo.visible = i < c.tramos;
    for (let j = primero; j < primero + c.tramos; j++) {
      const tr = tramos[j % c.tramos];
      if (tr.indice !== j) construirTramo(tr, j);
    }

    // Cajas flotantes
    const k0 = Math.max(0, Math.floor((Z_PRIMERA_CAJA - b.z) / SEPARACION_CAJAS));
    cajasF.forEach((m, i) => {
      const k = k0 + i;
      const p = posicionCaja(k);
      m.visible = !estado.cajasRecogidas.has(k) && p.z < b.z + 10;
      m.position.set(p.x, -0.15 + Math.sin(t * 2 + k) * 0.12, p.z);
      m.rotation.set(Math.sin(t + k) * 0.15, k + t * 0.2, Math.cos(t * 1.3 + k) * 0.15);
    });

    // Agua y sol siguen al barco
    agua.position.set(b.x, -0.35, b.z - 120);
    tiempoAgua.value = t;
    sol.position.set(b.x + 25, 45, b.z + 20);
    sol.target.position.set(b.x, 0, b.z - 10);

    // Cámara de tres cuartos, detrás del barco y suavizada
    const dx = Math.sin(b.rumbo), dz = -Math.cos(b.rumbo);
    posCamara.set(b.x - dx * 15 + 7, 9.5, b.z - dz * 15);
    if (!iniciada) { camera.position.copy(posCamara); iniciada = true; }
    camera.position.lerp(posCamara, Math.min(1, dt * 1.5));
    mirar.set(b.x + dx * 8, 1, b.z + dz * 8);
    camera.lookAt(mirar);

    renderer.render(scene, camera);
  }

  return {
    dibujar,
    ponerCalidad,
    saltar: n => { const m = munecos[n - 1]; if (m) m.salto = 1; }, // n = número de jugador
    info: () => ({ calls: renderer.info.render.calls, triangulos: renderer.info.render.triangles, gpu: gpuNombre(renderer) }),
  };
}

function gpuNombre(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}
