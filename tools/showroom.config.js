// The showroom's sheets (tools/test.ps1 -c tools/showroom.config.js); separate from the test suite
const path = require('path');
const base = require('../playwright.config.js');
module.exports = Object.assign({}, base, { testDir: '.', testMatch: 'showroom.spec.js', fullyParallel: false, workers: 1, reporter: 'list',
  outputDir: path.join(__dirname, '..', 'test-results', 'pw'),
  webServer: Object.assign({}, base.webServer, { cwd: path.join(__dirname, '..') }),
  use: Object.assign({}, base.use, { viewport: { width: 1800, height: 640 }, deviceScaleFactor: 2 }) });
