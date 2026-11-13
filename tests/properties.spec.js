// Wallpaper Engine properties: project.json ↔ js/properties.js, every property handled, applied live; the browser's settings panel
const { test, expect } = require('./support/harness');

test('project.json and js/properties.js agree; every property is handled by the listener', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0' });
  const r = await wp.run(async () => {
    const pj = await (await fetch('project.json')).json(), src = window.wallpaperPropertyListener.applyUserProperties.toString();
    const keys = Object.keys(pj.general.properties).filter(k => k !== 'schemecolor');
    return { same: JSON.stringify(pj.general.properties) === JSON.stringify(WE_PROPERTIES), file: pj.file, audio: pj.general.supportsaudioprocessing, preview: pj.preview,
      unhandled: keys.filter(k => !src.includes(`'${k}'`) && !(k.startsWith('w_') && WEAPON[k.slice(2)] && src.includes("'w_' + w.id"))) };
  });
  expect(r.same, 'run tools/gen_properties.py').toBe(true); expect(r.file).toBe('index.html'); expect(r.audio).toBe(true); expect(r.preview).toBe('preview.gif');
  expect(r.unhandled).toEqual([]);
});

test('properties apply at once: weapons, callsign, vision, quality, allies; the URL wins; the same seed does not reload', async ({ wp }) => {
  await wp.boot({ query: '?hour=12&seed=11&transit=0&auto=0' });
  const r = await wp.run(() => {
    const L = window.wallpaperPropertyListener, set = o => { const p = {}; for (const k in o) p[k] = { value: o[k] }; L.applyUserProperties(p); };
    set({ w_g25: false, w_rail: true, w_las: true, callsign: '  spectre 21 ', vision: 'bh', quality: 'low', allies: 0, autoarms: true, seed: 11 });
    const a = { weapons: CFG.weapons.join(','), arms: [...document.querySelectorAll('#arms button')].map(b => b.dataset.id).join(','), cur: ARMS.cur, call: CFG.callsign, mode: SENSOR.mode, msaa: SENSOR.rt.samples, pr: renderer.getPixelRatio(), allies: CFG.allies, auto: CFG.autoArms };
    set({ quality: 'high', w_g30: false, w_h105: false, w_rail: false, w_las: false });
    return Object.assign(a, { none: CFG.weapons.length, cur2: ARMS.cur, msaa2: SENSOR.rt.samples });
  });
  expect(r.weapons).toBe('g30,h105,las,rail'); expect(r.arms).toBe('g30,h105,las,rail'); expect(r.cur).toBe('g30');
  expect(r.call).toBe('SPECTRE 21'); expect(r.mode).toBe('bh'); expect(r.msaa).toBe(0); expect(r.pr).toBe(0.75); expect(r.allies).toBe(0);
  expect(r.auto, '?auto=0 wins').toBe(false);
  expect(r.none).toBe(0); expect(r.cur2).toBe(null); expect(r.msaa2).toBe(4);
  expect(await wp.run(() => typeof ready !== 'undefined' && ready && __t !== undefined)).toBe(true);
});

test('in a browser the settings panel lists every property and feeds the same listener', async ({ wp }) => {
  await wp.boot({ we: false, query: '?hour=12&seed=11&transit=0&cfg=1' });
  const r = await wp.run(() => {
    const ctl = k => document.querySelector(`#cfg [data-k="${k}"]`), keys = Object.keys(WE_PROPERTIES).filter(k => k !== 'schemecolor');
    const missing = keys.filter(k => !ctl(k));
    const c = ctl('w_b40'); c.checked = true; c.dispatchEvent(new Event('change'));
    const t = ctl('callsign'); t.value = 'hammer 11'; t.dispatchEvent(new Event('change'));
    const fixed = ctl('fixedhour').closest('.cfg-row').style.display;
    return { gear: !!document.getElementById('cfgGear'), missing, b40: CFG.weapons.includes('b40'), call: CFG.callsign, fixedHidden: fixed === 'none', saved: JSON.parse(localStorage.getItem('dangerclose.settings.v1')).props.w_b40 };
  });
  expect(r.gear).toBe(true); expect(r.missing).toEqual([]); expect(r.b40).toBe(true); expect(r.call).toBe('HAMMER 11');
  expect(r.fixedHidden, 'a fixed hour only with the fixed time mode').toBe(true); expect(r.saved).toBe(true);
});
