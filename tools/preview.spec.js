// Stage 1: the four vision modes side by side, by day and at night → test-results/sensor-day.png, sensor-night.png
const { test } = require('../tests/support/harness');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'test-results');

for (const [name, hour] of [['day', 12], ['night', 23.5]]) {
  test(`sensor sheet ${name}`, async ({ wp }) => {
    await wp.boot({ query: `?hour=${hour}&hud=0` });
    await wp.sim(3.2);
    const url = await wp.run(() => {
      const W = renderer.domElement.width, H = renderer.domElement.height, c = document.createElement('canvas');
      c.width = W * 2; c.height = H * 2; const g = c.getContext('2d');
      SENSOR_MODES.forEach((m, i) => {
        SENSOR.set(m); updateEnvironment(); renderFrame();
        const x = (i % 2) * W, y = (i >> 1) * H;
        g.drawImage(renderer.domElement, x, y);
        g.font = '600 18px Consolas, monospace'; g.fillStyle = '#000'; g.fillRect(x + 12, y + 12, 96, 30); g.fillStyle = '#fff'; g.fillText(SENSOR_LABEL[m], x + 22, y + 33);
      });
      return c.toDataURL('image/png');
    });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `sensor-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  });
}
