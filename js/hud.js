'use strict';
/* ===== The sensor HUD: a 2D canvas over the picture (compass, altitude ladder, clock, reticle, friend-or-foe brackets) and
   DOM for what takes clicks (the vision modes at the top left, the weapon selector at the bottom). Sizes follow the window's
   height (1080 p = 1) times the HUD scale setting. ?hud=0 hides it all (review sheets).                                     */
const HUD_COL = '#e2ebe6', HUD_DARK = 'rgba(0,0,0,0.5)', ALLY_COL = '#4da6ff', ENEMY_COL = '#ffffff';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const _hp = new V3();
/* dollars in three figures: $750, $12.4K, $1.25M, $3.40B, $1.00T */
function fmtMoney(v) {
  const U = ['', 'K', 'M', 'B', 'T']; let i = 0;
  while (i < 4 && v >= 1000) { v /= 1000; i++; }
  let s = i ? (v < 9.995 ? v.toFixed(2) : v < 99.95 ? v.toFixed(1) : v.toFixed(0)) : String(Math.round(v));
  if (s === '1000' && i < 4) { s = '1.00'; i++; }   // (999.7 rounds up into the next unit)
  return '$' + s + U[i];
}
const HUD = {
  on: false, cv: null, g: null, W: 0, H: 0, u: 1, ui: null, armsEl: null, boxes: [], domT: 0, cache: {}, spentShown: 0, spentRT: 0, spentDrop: 0,
  build() {
    this.on = QS.get('hud') !== '0';
    const modes = document.getElementById('modes');
    if (!this.on) { if (modes) modes.style.display = 'none'; return; }
    this.cv = document.createElement('canvas'); this.cv.id = 'hud'; document.body.insertBefore(this.cv, modes); this.g = this.cv.getContext('2d');
    for (const m of SENSOR_MODES) {
      const b = document.createElement('button'); b.textContent = SENSOR_LABEL[m]; b.dataset.m = m;
      b.onclick = () => { SENSOR.manual = true; SENSOR.set(m); updateEnvironment(); this.markModes(); };   // (never saved: the property gives the default at every start)
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
      b.onclick = () => { ARMS.select(w.id); BATTLE.manualUntil = T + 30; BATTLE.focus = null; BATTLE.seekT = 0; BATTLE.fTick = 0; this.markArms(); };   // (the auto-switching resumes 30 s later)
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
      const bar = !w.mag ? 1 : s.reload > 0 ? 1 - s.reload / (s.rl || w.reload) : 1, key = txt + bar.toFixed(2);
      if (this.cache[w.id] === key) continue; this.cache[w.id] = key;
      b.querySelector('.am').textContent = txt; b.querySelector('u').style.width = (bar * 100).toFixed(0) + '%';
    }
  },
  /* a stroke with a dark edge under it (readable over white-hot snow as well as night) */
  stroke(lw, col) { const g = this.g; g.lineWidth = lw + 2 * this.u; g.strokeStyle = HUD_DARK; g.stroke(); g.lineWidth = lw; g.strokeStyle = col || HUD_COL; g.stroke(); },
  text(s, x, y, size, align, col) { const g = this.g; g.font = `600 ${Math.round(size * this.u)}px Consolas, "Courier New", monospace`; g.textAlign = align || 'left'; g.lineWidth = 3 * this.u; g.strokeStyle = HUD_DARK; g.strokeText(s, x, y); g.fillStyle = col || HUD_COL; g.fillText(s, x, y); },
  heading() { return ((Math.atan2(CAM_TGT.x - camera.position.x, camera.position.z - CAM_TGT.z) / DEG) % 360 + 360) % 360; },   // (where the sensor looks: north is -z, east +x)
  altitude() { const t = GUNSHIP.tr; return 9400 + 180 * Math.sin(T * 0.031) + 90 * Math.sin(T * 0.11) + (GUNSHIP.state === 'transit' ? 400 * Math.sin(Math.PI * t.p) : 0); },
  draw() {
    if (!this.on) return;
    const g = this.g, W = this.W, H = this.H, u = this.u;
    g.clearRect(0, 0, W, H); g.lineCap = 'butt'; g.textBaseline = 'middle';
    this.brackets(); this.designate(); this.lockOn(); this.laseOn(); this.compass(W / 2, 52 * u); this.ladder(W - 64 * u, (H - this.sb) / 2);
    this.reticle(W / 2, H / 2);
    // the clock and the sensor point at the top right
    const now = getNow(), p2 = n => String(n).padStart(2, '0'), x = W - 40 * u;
    this.text(`${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`, x, 44 * u, 26, 'right');
    this.text(`${p2(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}  LCL`, x, 74 * u, 14, 'right');
    const alt = this.altitude(), slant = alt * 0.3048 / Math.sin(CAM_ELEV) / 1000;
    this.text(`SLANT ${slant.toFixed(2)} KM`, x, 100 * u, 14, 'right');
    const e = Math.round((44000 + CAM_TGT.x + MAP_HALF) / 10) % 10000, n = Math.round((68000 - CAM_TGT.z + MAP_HALF) / 10) % 10000;
    this.text(`GRID 38T LN ${String(e).padStart(4, '0')} ${String(n).padStart(4, '0')}`, x, 122 * u, 14, 'right');
    this.text(`ELEV ${Math.round(CAM_TGT.y * 3.28 + 1460)} FT`, x, 144 * u, 14, 'right');
    if (CFG.cost) { const now = RT(), dt = clamp(now - (this.spentRT || now), 0, 0.5); this.spentRT = now; this.text(`MISSION COST ${fmtMoney(this.spentAt(dt))}`, x, 166 * u, 14, 'right'); }   // (the money the gunship has fired off this mission: WEAPONS cost; BATTLE.spent, back to 0 after COST_RESET s of silence)
    else { this.spentShown = BATTLE.spent; this.spentRT = 0; }
    // the callsign and what the gunship is doing at the top left (under the mode buttons)
    this.text(CFG.callsign, 30 * u, 92 * u, 18);
    const T_ = GUNSHIP.tr, ao = k => k ? 'AO-' + k : 'OBJ', st = GUNSHIP.state === 'transit' ? `TRANSIT  ${ao(GUNSHIP.list.indexOf(T_.to) + 1)}  ${(Math.hypot(T_.to.x - CAM_TGT.x, T_.to.z - CAM_TGT.z) / 1000).toFixed(1)} KM` : `${AUD.fighting ? 'ENGAGING' : AUD.holding ? 'CEASE FIRE' : 'ORBIT'}  ${ao(GUNSHIP.ao)}`;
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
  /* a diamond on what the gunship is firing at */
  designate() {
    const f = BATTLE.focus; if (!f || !f.alive || GUNSHIP.state !== 'orbit' || (BATTLE.lock && BATTLE.lock.t === f)) return;   // (a lock on it draws its own diamond)
    _hp.copy(f.pos); _hp.y += f.ah; _hp.project(camera); if (_hp.z > 1 || Math.abs(_hp.x) > 1 || Math.abs(_hp.y) > 1) return;
    const g = this.g, u = this.u, x = (_hp.x + 1) / 2 * this.W, y = (1 - _hp.y) / 2 * this.H, s = 44 * u;
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); this.stroke(1.4 * u);
  },
  /* the money spent as shown, dt real seconds on: it rolls up to BATTLE.spent over a couple of seconds (a missile's price counts up,
     it does not jump; 99 % of a sum there in 2 s) */
  spentAt(dt) {   // (eased both ways; back to 0 after a mission: down the same way, the last 1 % of the drop at once, so it is there in 2 s)
    const s = BATTLE.spent, d = s - this.spentShown; this.spentDrop = d < 0 ? this.spentDrop || -d : 0;
    const v = this.spentShown + d * (1 - Math.exp(-dt * 2.3)); this.spentShown = Math.abs(s - v) < Math.max(1, this.spentDrop * 0.01) ? s : v; return this.spentShown;
  },
  /* a lock (BATTLE.lock: the AIM-9X's, the Hellfire's): a box on the target and a diamond round it, only their corners while the
     seeker locks on, the diamond shrinking from far out down onto the box; once it has it both drawn whole with a dot in the middle,
     then SHOOT boxed and blinking low in the middle (under the reticle, over the weapon selector) until the launch */
  /* the tracked object of the lock's target while a lock is drawn (a base structure's track is its mark, not its model), else null */
  lockObj() { const L = BATTLE.lock; return L && L.t.alive && GUNSHIP.state === 'orbit' ? L.t.mark || L.t.obj : null; },
  lockOn() {
    const L = BATTLE.lock, lk = this.lockObj(); this.lockDraw = null; if (!lk) return;
    const shoot = !!L.shootT; if (shoot && Math.floor((T - L.shootT) * 8) % 2 === 0) this.shootCue(this.W / 2, this.H - this.sb - 112 * this.u);
    const tr = TRACKS.find(t => t.obj === lk); _hp.copy(L.t.pos); _hp.y += tr ? tr.h : 2.5; _hp.project(camera); if (_hp.z > 1 || Math.abs(_hp.x) > 1.05 || Math.abs(_hp.y) > 1.05) return;
    const g = this.g, u = this.u, x = (_hp.x + 1) / 2 * this.W, y = (1 - _hp.y) / 2 * this.H, s = 30 * u, got = L.k >= 1, d = lerp(5.5 * s, 1.45 * s, smoothstep(0, 1, L.k));
    g.beginPath();
    this.corners([[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], got ? 0.5 : 0.2);   // (the box: in place of its track's bracket, brackets(), the same size and corners, not a second one by it)
    this.corners([[x, y - d], [x + d, y], [x, y + d], [x - d, y]], got ? 0.5 : 0.2 * 1.45 * s / d);   // (the diamond: corners the same length all the way in)
    this.stroke(2 * u);
    if (got) { g.beginPath(); g.arc(x, y, 2.4 * u, 0, TAU); this.stroke(1.2 * u); g.fillStyle = HUD_COL; g.fill(); }   // (the dot: locked)
    if (L.w === 'hf') this.spot(x, y);   // (the Hellfire's: the designator's spot on the target)
    this.lockDraw = { k: L.k, shoot, d: d / s, x: x / this.W, y: y / this.H };
  },
  /* a closed shape (its corners in order) into the path: whole (f 0.5), or only its corners, f of each side from each corner */
  corners(P, f) {
    const g = this.g, n = P.length;
    if (f >= 0.5) { g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < n; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); return; }
    for (let i = 0; i < n; i++) {
      const p = P[i], a = P[(i + n - 1) % n], b = P[(i + 1) % n];
      g.moveTo(p[0] + (a[0] - p[0]) * f, p[1] + (a[1] - p[1]) * f); g.lineTo(p[0], p[1]); g.lineTo(p[0] + (b[0] - p[0]) * f, p[1] + (b[1] - p[1]) * f);
    }
  },
  /* the laser's spot: a diamond, pulsing */
  spot(x, y) {
    const g = this.g, u = this.u, s = (7 + 2 * Math.sin(T * 12)) * u;
    g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); this.stroke(1.6 * u);
  },
  /* a Hellfire on its way (BATTLE.lase): the spot where the laser holds it, and LASE with the time to the hit where SHOOT was */
  laseOn() {
    const S = BATTLE.lase; this.laseDraw = null; if (!S) return;
    const m = S.m, tof = Math.max(0, (1 - m.p) * m.dur); this.cue(this.W / 2, this.H - this.sb - 112 * this.u, 'LASE ' + tof.toFixed(1));
    _hp.copy(S.p); _hp.y += 1; _hp.project(camera); if (_hp.z > 1 || Math.abs(_hp.x) > 1.05 || Math.abs(_hp.y) > 1.05) return;
    const x = (_hp.x + 1) / 2 * this.W, y = (1 - _hp.y) / 2 * this.H; this.spot(x, y);
    this.laseDraw = { tof, x: x / this.W, y: y / this.H };
  },
  /* SHOOT in a box, centred on (x, y) */
  shootCue(x, y) { this.cue(x, y, 'SHOOT'); },
  /* a word in a box, centred on (x, y) */
  cue(x, y, s) {
    const g = this.g, u = this.u; g.font = `600 ${Math.round(18 * u)}px Consolas, "Courier New", monospace`;
    const hw = g.measureText(s).width / 2 + 10 * u, hh = 15 * u;
    g.beginPath(); g.rect(x - hw, y - hh, 2 * hw, 2 * hh); this.stroke(2 * u); this.text(s, x, y + u, 18, 'center');
  },
  /* corner brackets of a fixed screen size: allies blue, enemies white */
  brackets() {
    const g = this.g, u = this.u, W = this.W, H = this.H, lk = this.lockObj(); this.boxes.length = 0;
    for (const side of ['ally', 'enemy']) {
      g.beginPath();
      for (const t of TRACKS) {
        if (t.side !== side || !t.obj.visible || t.obj === lk) continue;   // (a lock's target: its box is the lock's, lockOn)
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
