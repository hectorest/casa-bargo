# ⛵ Casa-barco

Juego cooperativo y tranquilo para jugar en el sofá: la partida se ve en la tele (navegador) y cada jugador maneja su puesto del barco desde el móvil.

## Cómo jugar (prototipo actual)

1. Abre en la tele: `https://hectorest.github.io/casa-bargo/`
2. Escanea el QR con el móvil (o entra en `…/mando/` y escribe el código de 4 letras).
3. El primero en subir lleva el **timón**: arrastra la rueda o inclina el móvil como un volante, y elige la velocidad con la palanca. Los demás son **pasajeros** (bocina y "pedir el timón").
4. Recoge las cajas que flotan cerca de las orillas. Ojo: en las curvas, a toda máquina, la corriente te empuja hacia fuera.

Sin nadie al timón, el barco va en piloto automático.

Teclas en la tele: `1` `2` `3` calidad gráfica · `D` panel de depuración. Parámetros de URL: `?q=bajo|medio|alto`, `?debug=1`.

## Desarrollo sin móvil ni internet: modo local

Añade `?local=1` y abre la tele y uno o varios mandos en pestañas del **mismo navegador**:

- Tele: `index.html?local=1`
- Mando: `mando/?local=1&sala=CODIGO` (el enlace aparece bajo el QR)

En modo local la comunicación va por `BroadcastChannel` en vez de WebRTC.

## Estructura

```
index.html            tele
mando/index.html      mando del móvil
js/comun/             río (geometría pura), protocolo de mensajes, red (PeerJS / local)
js/juego/estado.js    simulación pura: barco, jugadores, puestos (sin gráficos)
js/tv/                escena Three.js, sonidos, arranque de la tele
js/mando/             lógica del mando
prueba-rendimiento/   benchmark gráfico para comprobar la tele
pruebas/              pruebas automáticas
```

- **La tele es la autoridad**: recibe las entradas, avanza la simulación y envía a cada móvil solo lo que le toca.
- **Red**: WebRTC con [PeerJS](https://peerjs.com). El servidor público de PeerJS solo presenta a los dispositivos; luego los datos van directos por la wifi de casa. Requiere que tele y móviles estén en la misma red (las redes de invitados con aislamiento de clientes pueden bloquearlo).
- **Sin paso de compilación**: módulos ES nativos; Three.js, PeerJS y el generador de QR se cargan desde jsDelivr.

## Pruebas

```
node pruebas/estado.test.mjs     # simulación
```

`pruebas/tv-falsa.html?local=1` es una tele sin gráficos para pruebas automáticas de mando ↔ tele.

## Historia

El hilo narrativo es secreto. Cuando exista, irá cifrado en el repositorio y el juego lo descifrará al ejecutarse. No lo busques 🤫
