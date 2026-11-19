// Mensajes entre mando (móvil) y tele. Todos son objetos JSON con un campo `t` (tipo).
//
// Mando → Tele
//   { t: 'hola', id }                 al conectar; id es estable por móvil (localStorage)
//   { t: 'latido' }                   cada segundo, para detectar desconexiones
//   { t: 'timon', giro }              giro en [-1, 1] (negativo = babor/izquierda)
//   { t: 'velocidad', v }             palanca en [0, 1]
//   { t: 'bocina' }
//   { t: 'pedirTimon' }               un pasajero pide el timón
//
// Tele → Mando
//   { t: 'bienvenida', n, color, puesto }
//   { t: 'puesto', puesto }           cambio de puesto
//   { t: 'golpe', fuerza }            el barco ha rozado la orilla (vibrar)
//   { t: 'caja', total }              alguien ha recogido una caja
//   { t: 'aviso', texto }

export const PREFIJO_SALA = 'casabarco-v1-';
export const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O para no confundir

export function codigoAleatorio(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += LETRAS_CODIGO[Math.floor(Math.random() * LETRAS_CODIGO.length)];
  return s;
}

export function normalizarCodigo(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
