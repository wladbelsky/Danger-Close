/* In-page test helpers (injected with addInitScript before the wallpaper's scripts; everything here is resolved at
   call time, so the wallpaper's globals are available by then). Exposed as window.__t. */
(() => {
  'use strict';
  const H = window.__t = {};
  let rt = 1000;                       // simulated real time (RT)
  const DT = 0.05;
  H.rt = () => rt;
  H.setup = () => { window.RT = () => rt; CFG.lon = 0; };
  H.sim = (sec, o = {}) => {
    const n = Math.round(sec / DT); let steps = 0;
    for (let i = 0; i < n; i++) { rt += DT; if (o.audio) window.__audio(o.spec ? o.spec(rt) : demoSpectrum(rt, o.bpm || 124, !!o.pauses)); step(DT); steps++; if (o.until && o.until()) break; }   // (audio: music playing)
    return { steps, t: T };
  };
  H.render = () => { renderFrame(); };
  /* the picture's mean brightness over a screen rectangle (fractions of the canvas), read after a render in the same task */
  H.sample = (x0, y0, x1, y1) => {
    renderFrame();
    const c = document.createElement('canvas'), W = renderer.domElement.width, H_ = renderer.domElement.height;
    c.width = W; c.height = H_;
    const g = c.getContext('2d'); g.drawImage(renderer.domElement, 0, 0);
    const d = g.getImageData(x0 * W | 0, y0 * H_ | 0, Math.max(1, (x1 - x0) * W | 0), Math.max(1, (y1 - y0) * H_ | 0)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 4) / 255;
  };
  /* where a world point lands on screen, as fractions from the top left */
  H.screenOf = (x, y, z) => { const n = new THREE.Vector3(x, y, z).project(camera); return [(n.x + 1) / 2, (1 - n.y) / 2]; };
})();
