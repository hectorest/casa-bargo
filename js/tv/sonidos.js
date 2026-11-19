// Sonidos sintetizados con WebAudio: sin archivos que descargar.

export function crearSonidos() {
  let ctx = null;

  async function activar() {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      return ctx.state === 'running';
    } catch { return false; }
  }

  function tono({ tipo = 'sine', f0, f1 = f0, dur = 0.3, vol = 0.2, filtro = null, retardo = 0 }) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + retardo;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let ultimo = osc;
    if (filtro) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filtro; osc.connect(f); ultimo = f; }
    ultimo.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  return {
    activar,
    bocina() {
      tono({ tipo: 'sawtooth', f0: 155, dur: 0.9, vol: 0.18, filtro: 700 });
      tono({ tipo: 'sawtooth', f0: 196, dur: 0.9, vol: 0.12, filtro: 700 });
    },
    caja() {
      tono({ f0: 880, dur: 0.18, vol: 0.15 });
      tono({ f0: 1320, dur: 0.3, vol: 0.12, retardo: 0.09 });
    },
    campana() {
      tono({ tipo: 'triangle', f0: 1046, dur: 0.6, vol: 0.12 });
      tono({ tipo: 'triangle', f0: 1568, dur: 0.5, vol: 0.06, retardo: 0.02 });
    },
    golpe(fuerza = 0.5) {
      tono({ tipo: 'triangle', f0: 110, f1: 45, dur: 0.35, vol: 0.15 + fuerza * 0.25, filtro: 400 });
    },
  };
}
