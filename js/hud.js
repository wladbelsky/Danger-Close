'use strict';
/* ===== The sensor HUD: a 2D canvas over the picture (compass, altitude ladder, clock, reticle, friend-or-foe brackets) and
   DOM for what takes clicks (the vision modes at the top left, the weapon selector at the bottom). Sizes follow the window's
   height (1080 p = 1) times the HUD scale setting. ?hud=0 hides it all (review sheets).                                     */
const HUD_COL = '#e2ebe6', HUD_DARK = 'rgba(0,0,0,0.5)', ALLY_COL = '#4da6ff', ENEMY_COL = '#ffffff';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const _hp = new V3();
const HUD = {
  on: false, cv: null, g: null, W: 0, H: 0, u: 1, ui: null, armsEl: null, boxes: [], domT: 0, cache: {},
  build() {
    this.on = QS.get('hud') !== '0';
    const modes = document.getElementById('modes');
    if (!this.on) { if (modes) modes.style.display = 'none'; return; }
    this.cv = document.createElement('canvas'); this.cv.id = 'hud'; document.body.insertBefore(this.cv, modes); this.g = this.cv.getContext('2d');
    for (const m of SENSOR_MODES) {
      const b = document.createElement('button'); b.textContent = SENSOR_LABEL[m]; b.dataset.m = m;
      b.onclick = () => { SENSOR.set(m); updateEnvironment(); this.markModes(); };   // (never saved: the property gives the default at every start)
      modes.appendChild(b);
    }
    this.armsEl = document.getElementById('arms');
    this.buildArms(); this.resize(); this.markModes();
  },
  /* the selector: only the enabled weapons */
  buildArms() {
    if (!this.on) return; const el = this.armsEl; el.innerHTML = ''; this.cache = {};
    for (const w of ARMS.enabled()) {
      const b = document.createElement('button'); b.dataset.id = w.id;
      b.innerHTML = `<b>${w.name}</b><i>${w.sub}</i><span class="am"></span><s><u></u></s>`;
      b.onclick = () => { ARMS.select(w.id); this.markArms(); };
      el.appendChild(b);
    }
    this.markArms();
  },
  markModes() { if (this.on) for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.m === SENSOR.mode); },
  markArms() { if (this.on) for (const b of this.armsEl.children) b.classList.toggle('on', b.dataset.id === ARMS.cur); },
  resize() {
    if (!this.on) return;
    const pr = renderer.getPixelRatio(); this.W = this.cv.width = Math.max(1, Math.round(window.innerWidth * pr)); this.H = this.cv.height = Math.max(1, Math.round(window.innerHeight * pr));
    this.u = this.H / 1080 * CFG.hudScale; this.sb = CFG.hudBottom * pr;
    document.documentElement.style.setProperty('--hs', (window.innerHeight / 1080 * CFG.hudScale).toFixed(3)); document.documentElement.style.setProperty('--sb', CFG.hudBottom + 'px');
  },
  /* the ammunition in the selector, a few times a second (and only what changed) */
  updateDom() {
    for (const b of this.armsEl.children) {
      const w = WEAPON[b.dataset.id], s = ARMS.st[w.id], txt = !w.mag ? 'PWR 100' : s.reload > 0 ? 'RELOAD' : String(s.left).padStart(String(w.rounds).length, '0');
      const bar = !w.mag ? 1 : s.reload > 0 ? 1 - s.reload / w.reload : 1, key = txt + bar.toFixed(2);
      if (this.cache[w.id] === key) continue; this.cache[w.id] = key;
      b.querySelector('.am').textContent = txt; b.querySelector('u').style.width = (bar * 100).toFixed(0) + '%';
    }
  },
  /* a stroke with a dark edge under it (readable over white-hot snow as well as night) */
  stroke(lw, col) { const g = this.g; g.lineWidth = lw + 2 * this.u; g.strokeStyle = HUD_DARK; g.stroke(); g.lineWidth = lw; g.strokeStyle = col || HUD_COL; g.stroke(); },
  text(s, x, y, size, align, col) { const g = this.g; g.font = `600 ${Math.round(size * this.u)}px Consolas, "Courier New", monospace`; g.textAlign = align || 'left'; g.lineWidth = 3 * this.u; g.strokeStyle = HUD_DARK; g.strokeText(s, x, y); g.fillStyle = col || HUD_COL; g.fillText(s, x, y); },
  heading() { return ((Math.atan2(-Math.cos(camAz), Math.sin(camAz)) / DEG) % 360 + 360) % 360; },   // (where the sensor looks: north is -z, east +x)
  altitude() { const t = GUNSHIP.tr; return 9400 + 180 * Math.sin(T * 0.031) + 90 * Math.sin(T * 0.11) + (GUNSHIP.state === 'transit' ? 400 * Math.sin(Math.PI * t.p) : 0); },
  draw() {
    if (!this.on) return;
    const g = this.g, W = this.W, H = this.H, u = this.u;
    g.clearRect(0, 0, W, H); g.lineCap = 'butt'; g.textBaseline = 'middle';
    this.brackets(); this.compass(W / 2, 52 * u); this.ladder(W - 64 * u, (H - this.sb) / 2); this.reticle(W / 2, H / 2);
    // the clock and the sensor point at the top right
    const now = getNow(), p2 = n => String(n).padStart(2, '0'), x = W - 40 * u;
    this.text(`${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`, x, 44 * u, 26, 'right');
    this.text(`${p2(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}  LCL`, x, 74 * u, 14, 'right');
    const alt = this.altitude(), slant = alt * 0.3048 / Math.sin(CAM_ELEV) / 1000;
    this.text(`SLANT ${slant.toFixed(2)} KM`, x, 100 * u, 14, 'right');
    const e = Math.round((44000 + CAM_TGT.x + MAP_HALF) / 10) % 10000, n = Math.round((68000 - CAM_TGT.z + MAP_HALF) / 10) % 10000;
    this.text(`GRID 38T LN ${String(e).padStart(4, '0')} ${String(n).padStart(4, '0')}`, x, 122 * u, 14, 'right');
    this.text(`ELEV ${Math.round(CAM_TGT.y * 3.28 + 1460)} FT`, x, 144 * u, 14, 'right');
    // the callsign and what the gunship is doing at the top left (under the mode buttons)
    this.text(CFG.callsign, 30 * u, 92 * u, 18);
    const T_ = GUNSHIP.tr, st = GUNSHIP.state === 'transit' ? `TRANSIT  AO-${GUNSHIP.list.indexOf(T_.to) + 1}  ${(Math.hypot(T_.to.x - CAM_TGT.x, T_.to.z - CAM_TGT.z) / 1000).toFixed(1)} KM` : `ORBIT  AO-${GUNSHIP.ao}`;
    this.text(st, 30 * u, 116 * u, 14);
    // the lens at the bottom left
    const fov = camera.fov, yb = H - this.sb;
    this.text(`FOV ${fov.toFixed(2)}°`, 30 * u, yb - 84 * u, 14);
    this.text(`ZOOM ×${(CFG.zoom / 100 * GUNSHIP.zm).toFixed(2)}`, 30 * u, yb - 62 * u, 14);
    if (ARMS.w) this.text(`${ARMS.w.name} ${ARMS.w.sub}`, 30 * u, yb - 40 * u, 14);
    if ((this.domT -= 1) <= 0) { this.domT = 12; this.updateDom(); }
  },
  /* the compass tape: ±45° around the sensor's heading */
  compass(cx, y) {
    const g = this.g, u = this.u, hd = this.heading(), half = 210 * u, k = half / 45;
    g.beginPath();
    for (let d = Math.ceil((hd - 45) / 5) * 5; d <= hd + 45; d += 5) { const x = cx + (d - hd) * k, L = d % 30 === 0 ? 12 : d % 10 === 0 ? 8 : 4; g.moveTo(x, y); g.lineTo(x, y + L * u); }
    g.moveTo(cx - half, y); g.lineTo(cx + half, y);
    g.moveTo(cx, y + 20 * u); g.lineTo(cx - 6 * u, y + 28 * u); g.moveTo(cx, y + 20 * u); g.lineTo(cx + 6 * u, y + 28 * u);
    this.stroke(1.6 * u);
    for (let d = Math.ceil((hd - 45) / 30) * 30; d <= hd + 45; d += 30) {
      const a = ((d % 360) + 360) % 360, s = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] || String(a / 10).padStart(2, '0');
      if (Math.abs(d - hd) < 40) this.text(s, cx + (d - hd) * k, y - 14 * u, 14, 'center');
    }
    this.text(String(Math.round(hd) % 360).padStart(3, '0'), cx, y + 42 * u, 16, 'center');
  },
  /* the altitude ladder (feet) on the right */
  ladder(x, cy) {
    const g = this.g, u = this.u, alt = this.altitude(), k = 24 * u / 100, span = 600;
    g.beginPath(); g.moveTo(x, cy - span * k); g.lineTo(x, cy + span * k);
    for (let a = Math.ceil((alt - span) / 100) * 100; a <= alt + span; a += 100) { const y = cy - (a - alt) * k; g.moveTo(x, y); g.lineTo(x - (a % 500 === 0 ? 14 : 7) * u, y); }
    g.moveTo(x + 4 * u, cy); g.lineTo(x + 12 * u, cy - 6 * u); g.moveTo(x + 4 * u, cy); g.lineTo(x + 12 * u, cy + 6 * u);
    this.stroke(1.6 * u);
    for (let a = Math.ceil((alt - span) / 500) * 500; a <= alt + span; a += 500) { const y = cy - (a - alt) * k; if (Math.abs(y - cy) > 16 * u) this.text(String(a), x - 20 * u, y, 12, 'right'); }
    this.text(Math.round(alt).toLocaleString('en-US'), x - 20 * u, cy, 16, 'right');
    this.text('ALT FT', x, cy - span * k - 16 * u, 12, 'center');
  },
  /* the reticle of the selected weapon */
  reticle(cx, cy) {
    const g = this.g, u = this.u, w = ARMS.w; if (!w) return;
    const line = (x0, y0, x1, y1) => { g.moveTo(cx + x0 * u, cy + y0 * u); g.lineTo(cx + x1 * u, cy + y1 * u); };
    const cross = (a, b) => { line(-b, 0, -a, 0); line(a, 0, b, 0); line(0, -b, 0, -a); line(0, a, 0, b); };
    const corners = (hw, hh, c) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) { line(sx * hw, sy * hh, sx * (hw - c), sy * hh); line(sx * hw, sy * hh, sx * hw, sy * (hh - c)); } };
    g.beginPath();
    switch (w.reticle) {
      case 'cross': cross(9, 44); line(-2, 0, 2, 0); break;
      case 'box': cross(26, 60); corners(22, 22, 9); break;
      case 'frame': cross(14, 40); corners(110, 70, 26); line(-110, 0, -96, 0); line(96, 0, 110, 0); line(0, -70, 0, -58); line(0, 58, 0, 70); break;
      case 'circle': g.moveTo(cx + 54 * u, cy); g.arc(cx, cy, 54 * u, 0, TAU); line(0, -10, 10, 0); line(10, 0, 0, 10); line(0, 10, -10, 0); line(-10, 0, 0, -10); cross(54, 72); break;
      case 'seeker': g.moveTo(cx + 80 * u, cy); g.arc(cx, cy, 80 * u, 0, TAU); g.moveTo(cx + 16 * u, cy); g.arc(cx, cy, 16 * u, 0, TAU); cross(80, 96); break;
      case 'laser': g.moveTo(cx + 30 * u, cy); g.arc(cx, cy, 30 * u, 0, TAU); g.moveTo(cx + 6 * u, cy); g.arc(cx, cy, 6 * u, 0, TAU); cross(30, 120); break;
      case 'rail': line(-140, 0, -16, 0); line(16, 0, 140, 0); for (const s of [-1, 1]) for (const d of [40, 80, 120]) line(s * d, -6, s * d, 6); line(0, -24, 0, -10); line(0, 10, 0, 24); break;
    }
    this.stroke(1.6 * u);
  },
  /* corner brackets of a fixed screen size: allies blue, enemies white */
  brackets() {
    const g = this.g, u = this.u, W = this.W, H = this.H; this.boxes.length = 0;
    for (const side of ['ally', 'enemy']) {
      g.beginPath();
      for (const t of TRACKS) {
        if (t.side !== side || !t.obj.visible) continue;
        _hp.copy(t.obj.position); _hp.y += t.h; _hp.project(camera);
        if (_hp.z > 1 || Math.abs(_hp.x) > 1.05 || Math.abs(_hp.y) > 1.05) continue;
        const x = (_hp.x + 1) / 2 * W, y = (1 - _hp.y) / 2 * H, s = (t.inf ? 16 : 30) * u, c = s * 0.4;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.moveTo(x + sx * (s - c), y + sy * s); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * s, y + sy * (s - c)); }
        this.boxes.push({ x: x / W, y: y / H, s: s / H, side });
      }
      this.stroke(2 * u, side === 'ally' ? ALLY_COL : ENEMY_COL);
    }
  }
};
