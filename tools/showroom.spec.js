// The showroom's sheets (tools/test.ps1 -c tools/showroom.config.js): each model from three sides, TV and thermal →
// test-results/showroom-<name>.png, showroom-<name>-body.png (main rotors hidden, closer), showroom-<name>-body-ir.png, showroom-<name>-side / -front / -top.png (the body's views close), showroom.json (sizes, triangles, meshes).
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'test-results');

test('showroom sheets', async ({ page }) => {
  test.setTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/showroom.html'); await page.waitForFunction(() => window.SHOWROOM && SHOWROOM.ready);
  const names = await page.evaluate(() => SHOWROOM.names);
  const all = []; fs.mkdirSync(OUT, { recursive: true });
  for (const n of names) for (const [ir, body] of [[false, false], [false, true], [true, true]]) {
    const st = await page.evaluate(([n, ir, body]) => { SHOWROOM.setIR(ir); SHOWROOM.setBody(body); return SHOWROOM.show(n); }, [n, ir, body]);
    if (!ir && !body) all.push(st);
    await page.locator('#c').screenshot({ path: path.join(OUT, `showroom-${n}${body ? '-body' : ''}${ir ? '-ir' : ''}.png`) });
    if (body && !ir) { const b = await page.locator('#c').boundingBox(); for (const [i, v] of ['side', 'front', 'top'].entries()) await page.screenshot({ path: path.join(OUT, `showroom-${n}-${v}.png`), clip: { x: b.x + i * b.width / 3, y: b.y + b.height * 0.15, width: b.width / 3, height: b.height * 0.7} }); }   // (each view of the body on its own, at twice the pixels)
  }
  fs.writeFileSync(path.join(OUT, 'showroom.json'), JSON.stringify(all, null, 1)); console.log(JSON.stringify(all));
  expect(errors).toEqual([]);
});
