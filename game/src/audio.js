// Procedural WebAudio only — no audio files. Engine hum, siren, blips, thuds.
export function createAudio() {
  let ctx = null, muted = false, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenTimer = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(engineGain); engineGain.connect(ctx.destination); engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(ctx.destination); sirenOsc.start();
      let hi = true;
      sirenTimer = setInterval(() => { if (sirenOsc && !muted) sirenOsc.frequency.value = hi ? 950 : 650; hi = !hi; }, 420);
    } catch { ctx = null; }
    return ctx;
  }
  function blip(freq, dur, type = 'sine', vol = 0.15) {
    if (!ensure() || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur);
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEngine(speed01, driving) {
      if (!ensure()) return;
      const target = driving && !muted ? 0.03 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(45 + speed01 * 160, ctx.currentTime, 0.1);
    },
    setSiren(on) { if (!ensure()) return; sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.2); },
    pickup() { blip(880, 0.18, 'sine', 0.2); setTimeout(() => blip(1320, 0.22, 'sine', 0.2), 90); },
    punch() { blip(120, 0.12, 'square', 0.2); },
    shot() { blip(220, 0.08, 'square', 0.22); },
    cash() { blip(660, 0.12); setTimeout(() => blip(990, 0.2), 80); },
    busted() { blip(440, 0.3, 'sawtooth', 0.15); setTimeout(() => blip(330, 0.5, 'sawtooth', 0.15), 200); },
    toggleMute() { muted = !muted; if (ctx) { if (engineGain) engineGain.gain.value = 0; if (sirenGain) sirenGain.gain.value = 0; } return muted; },
    isMuted() { return muted; },
    // play-test handle: current WebAudio state (no gameplay effect)
    debug() { return { muted, hasCtx: !!ctx, state: ctx ? ctx.state : 'none', siren: sirenGain ? +sirenGain.gain.value.toFixed(3) : 0, engine: engineGain ? +engineGain.gain.value.toFixed(3) : 0 }; },
  };
}
