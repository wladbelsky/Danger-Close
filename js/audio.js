'use strict';
/* ===== Audio: the spectrum from Wallpaper Engine → beats in three bands, how heavy the music is, and the arming latch =====
   Sound must last ARM_DELAY seconds before the fight starts (a notification ping never does). When it stops the fight holds
   for DISARM_DELAY seconds (nobody fires), then stands down; sound lasting RESUME_DELAY seconds in the hold resumes it.
   In a browser ?demo=<bpm> plays a synthetic beat (with silent bars: ?demo=124), ?demo=124&pause=0 without them.          */
const ARM_DELAY = 5, DISARM_DELAY = 5, RESUME_DELAY = 1;
const AUD = {
  level: 0, heavy: 0, lastActive: -99, soundStart: -1, raw: new Float32Array(128), combat: false, holdUntil: 0,
  short: 0, long: 0, lastCall: -1, calmFrom: -1, calmT: -99, calmStart: -99, lastDrop: -99, armedAt: -99, drops: 0,   // (loudness over ~0.6 s and ~8 s; a quiet part's start and end; the last drop)
  get active() { return RT() - this.lastActive < 1.6; },
  get drive() { return smoothstep(0.15, 0.6, this.heavy); },                                             // how hard the music drives the fight, 0..1
  get calm() { return this.calmFrom >= 0 && RT() - this.calmFrom > 1; },                                 // a quiet part of the music (not silence's hold): the fight at half pace
  get hot() { return this.soundStart >= 0 && this.active && RT() - this.soundStart >= ARM_DELAY; },   // long enough to fight
  get armed() { return this.combat; },
  get holding() { return this.holdUntil > 0; },
  get fighting() { return this.combat && !this.holding; }                                                // armed and not holding: everybody fires
};
function updateArming() {
  if (!AUD.combat) { AUD.combat = AUD.hot; if (AUD.combat) AUD.armedAt = RT(); return; }
  if (AUD.active && (!AUD.holding || AUD.lastActive - AUD.soundStart >= RESUME_DELAY)) { AUD.holdUntil = 0; return; }
  if (!AUD.holding) AUD.holdUntil = RT() + DISARM_DELAY;
  else if (RT() >= AUD.holdUntil) { AUD.holdUntil = 0; AUD.combat = false; }
}
const BANDS = {
  low:  { from: 0, to: 4,   thr: 0.10, ratio: 1.35, gap: 0.2,  hist: [], prev: 0, last: -9, val: 0, fh: [], peak: 0.2, norm: 0 },
  mid:  { from: 6, to: 22,  thr: 0.05, ratio: 1.30, gap: 0.12, hist: [], prev: 0, last: -9, val: 0, fh: [], peak: 0.2, norm: 0 },
  high: { from: 26, to: 56, thr: 0.03, ratio: 1.30, gap: 0.10, hist: [], prev: 0, last: -9, val: 0, fh: [], peak: 0.2, norm: 0 }
};
const PREV_RAW = new Float32Array(128);
function onAudio(arr) {
  if (!ready) return;
  for (let i = 0; i < 128; i++) AUD.raw[i] = Math.min(1, arr[i] || 0);
  const sens = Math.max(0.1, CFG.sens / 100); let tot = 0, kick = 0;
  for (const key in BANDS) {
    const b = BANDS[key]; let e = 0, n = 0;
    for (let i = b.from; i <= b.to; i++) { e += AUD.raw[i] + AUD.raw[64 + i]; n += 2; }
    e /= n;
    let avg = e; if (b.hist.length) { avg = 0; for (const h of b.hist) avg += h; avg /= b.hist.length; }
    b.hist.push(e); if (b.hist.length > 40) b.hist.shift();
    const thr = b.thr / sens, ratio = 1 + (b.ratio - 1) / sens;
    let flux = 0;   // spectral flux: rises in single bins catch hits inside a dense, compressed mix
    for (let i = b.from; i <= b.to; i++) flux += Math.max(0, AUD.raw[i] - PREV_RAW[i]) + Math.max(0, AUD.raw[64 + i] - PREV_RAW[64 + i]);
    flux /= n;
    let fm = 0, fs = 0; for (const f of b.fh) fm += f; fm /= Math.max(1, b.fh.length);
    for (const f of b.fh) fs += (f - fm) * (f - fm); fs = Math.sqrt(fs / Math.max(1, b.fh.length));
    b.fh.push(flux); if (b.fh.length > 30) b.fh.shift();
    const energyHit = e > thr && e > avg * ratio && e > b.prev * 1.04;
    const fluxHit = e > thr * 0.6 && flux > fm + fs * (1.6 / sens) && flux > 0.02 / sens;
    if ((energyHit || fluxHit) && RT() - b.last > b.gap) {
      b.last = RT(); const st = clamp(Math.max(e / Math.max(avg, 0.01), 1 + flux / Math.max(fm, 0.005) * 0.15), 1, 3);
      BATTLE.onBeat(key, st); if (key === 'low') { kick = st; SENSOR.kick(st); }
    }
    b.peak = Math.max(e, b.peak * 0.9985, 0.05); b.norm = e / b.peak;   // automatic gain: the loudness per band
    b.prev = e; b.val = e; tot += e;
  }
  PREV_RAW.set(AUD.raw);
  const dense = (BANDS.mid.norm * 0.5 + BANDS.low.norm * 0.3 + BANDS.high.norm * 0.2) * smoothstep(0.03, 0.12, (BANDS.mid.val + BANDS.low.val) / 2);
  AUD.heavy += (dense - AUD.heavy) * (dense > AUD.heavy ? 0.08 : 0.02);
  AUD.level = tot / 3;
  if (AUD.level > 0.012) { if (AUD.soundStart < 0 || !AUD.active) AUD.soundStart = RT(); AUD.lastActive = RT(); }
  else if (!AUD.active) AUD.soundStart = -1;
  dynamics(kick);
}
/* the music's shape: a quiet part (the last ~0.6 s under half the last ~8 s) and a drop (a kick that brings the loudness back
   within 20 s of a quiet part of 2 s or more that began after the fight was armed) */
function dynamics(kick) {
  const now = RT(), dt = AUD.lastCall < 0 ? 0 : clamp(now - AUD.lastCall, 0, 0.25); AUD.lastCall = now;
  const L = AUD.level; AUD.short += (L - AUD.short) * (1 - Math.exp(-dt / 0.6)); AUD.long += (L - AUD.long) * (1 - Math.exp(-dt / 8));
  if (AUD.short < AUD.long * 0.5 && AUD.long > 0.004) { if (AUD.calmFrom < 0) AUD.calmFrom = now; if (now - AUD.calmFrom >= 2) { AUD.calmT = now; AUD.calmStart = AUD.calmFrom; } }
  else if (AUD.short > AUD.long * 0.7) AUD.calmFrom = -1;
  if (kick > 1.3 && AUD.fighting && AUD.calmFrom < 0 && now - AUD.calmT < 20 && AUD.calmStart > AUD.armedAt && L > AUD.long * 1.05 && now - AUD.lastDrop > 20) { AUD.lastDrop = now; AUD.drops++; BATTLE.onDrop(); }
}
/* a synthetic spectrum at time t: kick on every beat, snare on every second, hats on the half beats; with pauses bars 6–9 of every
   12 are a quiet part (hats only, then a quiet hat) and bars 10–11 silent, so the kick's return is a drop */
const DEMO = { on: false, bpm: 124, pauses: true };
function demoSpectrum(t, bpm, pauses) {
  const arr = new Array(128).fill(0), beat = 60 / bpm, ph = t % beat, bi = Math.floor(t / beat), bar = Math.floor(bi / 4) % 12;
  if (pauses && bar >= 10) return arr;
  const quiet = pauses && bar >= 6, hk = pauses && bar >= 8 ? 0.4 : 1;
  const kick = quiet ? 0 : Math.exp(-ph * 14), snare = !quiet && (bi % 2 === 1) ? Math.exp(-ph * 12) : 0, hat = hk * Math.exp(-(t % (beat / 2)) * 30), big = bi % 8 === 0 ? 1.5 : 1;
  for (let i = 0; i < 64; i++) {
    let v = 0.03 * Math.random();
    if (i < 6) v += 0.6 * kick * big; if (i >= 6 && i < 24) v += 0.55 * snare + (quiet ? 0 : 0.08); if (i >= 26) v += 0.35 * hat * (1 - i / 80);
    arr[i] = arr[64 + i] = v;
  }
  return arr;
}
function initAudio() {
  if (window.wallpaperRegisterAudioListener) { window.wallpaperRegisterAudioListener(onAudio); return; }
  if (QS.has('demo')) { DEMO.on = true; DEMO.bpm = parseFloat(QS.get('demo')) || 124; DEMO.pauses = QS.get('pause') !== '0'; }
}
