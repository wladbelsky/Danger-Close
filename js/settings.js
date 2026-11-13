'use strict';
/* ===== The settings panel in a browser (not in Wallpaper Engine, which has its own) =====
   Every property of project.json (js/properties.js), fed through the same wallpaperPropertyListener Wallpaper Engine calls and
   kept in localStorage; a demo beat and an audio file player stand in for the music Wallpaper Engine would hear.
   Left out under automated tests (navigator.webdriver) unless the URL asks for it with ?cfg: the tests set what they need. */
const FILE_AUDIO = { playing: false };
(function () {
  if (window.wallpaperRegisterAudioListener || (navigator.webdriver && !QS.has('cfg'))) return;
  const KEY = 'dangerclose.settings.v1';
  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } },
    save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage unavailable */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  };
  const saved = store.load(), vals = {};
  for (const [k, p] of Object.entries(WE_PROPERTIES)) vals[k] = saved.props && k in saved.props ? saved.props[k] : p.value;
  if (saved.demo && !QS.has('demo')) Object.assign(DEMO, saved.demo);
  const persist = () => store.save({ props: vals, demo: { on: DEMO.on, bpm: DEMO.bpm, pauses: DEMO.pauses } });
  const apply = obj => window.wallpaperPropertyListener.applyUserProperties(obj);
  const initial = {}; for (const k in vals) initial[k] = { value: vals[k] };
  apply(initial);   // (the listener lets the URL's test parameters win)

  /* ---- helpers ---- */
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const weToHex = s => '#' + s.split(' ').map(c => Math.round(clamp(parseFloat(c), 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  const hexToWe = h => [1, 3, 5].map(i => (parseInt(h.substr(i, 2), 16) / 255).toFixed(3)).join(' ');
  const condFn = c => { try { return new Function('v', 'return (' + c.replace(/(\w+)\.value/g, 'v["$1"]') + ');'); } catch (e) { return () => true; } };
  const GROUPS = [[1, 9, 'Sensor & HUD'], [10, 19, 'Time & weather'], [20, 29, 'Weapons'], [30, 39, 'Fight & music'], [40, 49, 'Map & quality']];

  /* ---- the drawer ---- */
  const gear = el('button', 'cfg-gear', '⚙'); gear.id = 'cfgGear'; gear.title = 'Settings';
  const drawer = el('div', 'cfg'); drawer.id = 'cfg';
  const head = el('div', 'cfg-head'); head.append(el('span', 'cfg-title', 'DANGER CLOSE · SETTINGS'));
  const close = el('button', 'cfg-x', '✕'); head.append(close);
  const body = el('div', 'cfg-body');
  drawer.append(head, body); document.body.append(gear, drawer);
  gear.onclick = () => drawer.classList.toggle('open'); close.onclick = () => drawer.classList.remove('open');

  const rows = [];
  const entries = Object.entries(WE_PROPERTIES).filter(([k]) => k !== 'schemecolor').sort((a, b) => a[1].order - b[1].order);
  for (const [g0, g1, gname] of GROUPS) {
    const items = entries.filter(([, p]) => p.order >= g0 && p.order <= g1); if (!items.length) continue;
    body.append(el('div', 'cfg-sec', gname));
    for (const [k, p] of items) {
      const row = el('div', 'cfg-row'), lab = el('label', 'cfg-lab', p.text); let ctrl, out = null;
      const set = v => { vals[k] = v; apply({ [k]: { value: v } }); persist(); refresh(); };
      if (p.type === 'slider') {
        const step = p.fraction ? Math.pow(10, -(p.precision || 1)) : 1;
        ctrl = el('input'); Object.assign(ctrl, { type: 'range', min: p.min, max: p.max, step, value: vals[k] });
        out = el('span', 'cfg-val', String(vals[k]));
        ctrl.oninput = () => { out.textContent = ctrl.value; };
        ctrl.onchange = () => set(parseFloat(ctrl.value));   // (on release: a new seed reloads the page)
      } else if (p.type === 'bool') {
        ctrl = el('input'); ctrl.type = 'checkbox'; ctrl.checked = !!vals[k]; ctrl.onchange = () => set(ctrl.checked); row.classList.add('cfg-bool');
      } else if (p.type === 'combo') {
        ctrl = el('select'); for (const o of p.options) { const op = el('option', null, o.label); op.value = o.value; ctrl.append(op); }
        ctrl.value = vals[k]; ctrl.onchange = () => set(ctrl.value);
      } else if (p.type === 'color') {
        ctrl = el('input'); ctrl.type = 'color'; ctrl.value = weToHex(vals[k]); ctrl.oninput = () => set(hexToWe(ctrl.value));
      } else {
        ctrl = el('input'); ctrl.type = 'text'; ctrl.maxLength = 20; ctrl.value = vals[k]; ctrl.onchange = () => set(ctrl.value);
      }
      ctrl.classList.add('cfg-ctl'); ctrl.dataset.k = k;
      row.append(lab, ctrl); if (out) row.append(out); body.append(row);
      rows.push({ row, cond: p.condition ? condFn(p.condition) : null });
    }
  }

  /* ---- music for the browser: a demo beat, or an audio file ---- */
  body.append(el('div', 'cfg-sec', 'Music (browser only)'));
  const line = (label, make, bool) => { const r = el('div', 'cfg-row' + (bool ? ' cfg-bool' : '')); r.append(el('label', 'cfg-lab', label)); make(r); body.append(r); return r; };
  line('Demo beat', r => { const c = el('input', 'cfg-ctl'); c.type = 'checkbox'; c.checked = DEMO.on; c.onchange = () => { DEMO.on = c.checked; persist(); }; r.append(c); }, true);
  line('Tempo, BPM', r => { const c = el('input', 'cfg-ctl'), o = el('span', 'cfg-val', String(DEMO.bpm)); Object.assign(c, { type: 'range', min: 70, max: 180, step: 1, value: DEMO.bpm }); c.oninput = () => { DEMO.bpm = +c.value; o.textContent = c.value; persist(); }; r.append(c, o); });
  line('Silent gaps between loops', r => { const c = el('input', 'cfg-ctl'); c.type = 'checkbox'; c.checked = DEMO.pauses; c.onchange = () => { DEMO.pauses = c.checked; persist(); }; r.append(c); }, true);
  body.append(el('div', 'cfg-note', 'Five seconds of music bring the enemy in; when it stops, they pull back. The beats set when the gunship fires.'));

  // an audio file, analysed with Web Audio into the same 128 bins Wallpaper Engine gives (64 log-spaced bands a channel, 0..1, ~30 Hz)
  const FA = FILE_AUDIO, pickIn = el('input'); pickIn.type = 'file'; pickIn.accept = 'audio/*'; pickIn.style.display = 'none';
  const pickBtn = el('button', 'cfg-btn', 'Play an audio file…'), nameEl = el('div', 'cfg-file', 'No file loaded');
  const prog = el('div', 'cfg-prog'), progBar = el('i'); prog.append(progBar);
  const ctl = el('div', 'cfg-player'), playBtn = el('button', null, '▶ Play'), stopBtn = el('button', null, '■ Stop'); ctl.append(playBtn, stopBtn);
  body.append(pickIn, pickBtn, nameEl, prog, ctl);
  line('Volume', r => { const c = el('input', 'cfg-ctl'), o = el('span', 'cfg-val', '80'); Object.assign(c, { type: 'range', min: 0, max: 100, step: 1, value: 80 }); c.oninput = () => { o.textContent = c.value; if (FA.el) FA.el.volume = c.value / 100; }; r.append(c, o); FA.volCtl = c; });
  pickBtn.onclick = () => pickIn.click();
  pickIn.onchange = () => {
    const f = pickIn.files && pickIn.files[0]; if (!f) return;
    if (FA.el) { FA.el.pause(); URL.revokeObjectURL(FA.el.src); }
    if (!FA.ctx) FA.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const a = new Audio(URL.createObjectURL(f)); a.loop = true; a.volume = FA.volCtl.value / 100;
    const src = FA.ctx.createMediaElementSource(a);
    FA.an = FA.ctx.createAnalyser(); FA.an.fftSize = 2048; FA.an.smoothingTimeConstant = 0.3; FA.an.minDecibels = -90; FA.an.maxDecibels = -10;
    src.connect(FA.an); FA.an.connect(FA.ctx.destination);
    FA.bins = new Uint8Array(FA.an.frequencyBinCount); FA.el = a;
    a.onplay = () => { FA.playing = true; playBtn.textContent = '❚❚ Pause'; };
    a.onpause = a.onended = () => { FA.playing = false; playBtn.textContent = '▶ Play'; };
    nameEl.textContent = f.name; FA.ctx.resume(); a.play();
  };
  playBtn.onclick = () => { if (!FA.el) return pickIn.click(); FA.ctx.resume(); FA.el.paused ? FA.el.play() : FA.el.pause(); };
  stopBtn.onclick = () => { if (FA.el) { FA.el.pause(); FA.el.currentTime = 0; } };
  prog.onclick = e => { if (FA.el && FA.el.duration) { const r = prog.getBoundingClientRect(); FA.el.currentTime = (e.clientX - r.left) / r.width * FA.el.duration; } };
  setInterval(() => {
    if (FA.el && FA.el.duration) progBar.style.width = (FA.el.currentTime / FA.el.duration * 100).toFixed(1) + '%';
    if (!FA.playing || !FA.an) return;
    FA.an.getByteFrequencyData(FA.bins);
    const bw = FA.ctx.sampleRate / FA.an.fftSize, arr = new Array(128);
    for (let i = 0; i < 64; i++) {
      const f0 = 40 * Math.pow(14000 / 40, i / 64), f1 = 40 * Math.pow(14000 / 40, (i + 1) / 64), b0 = Math.floor(f0 / bw), b1 = Math.max(b0 + 1, Math.ceil(f1 / bw));
      let m = 0; for (let b = b0; b < b1 && b < FA.bins.length; b++) m = Math.max(m, FA.bins[b]);
      arr[i] = arr[64 + i] = Math.pow(m / 255, 2.2);
    }
    onAudio(arr);
  }, 33);

  const reset = el('button', 'cfg-btn cfg-reset', 'Reset all to defaults'); reset.onclick = () => { store.clear(); location.reload(); }; body.append(reset);
  function refresh() { for (const r of rows) r.row.style.display = !r.cond || r.cond(vals) ? '' : 'none'; }
  refresh();
})();
