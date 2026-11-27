// Tiny static file server for the tests (no dependencies): node tests/support/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..'), port = +process.argv[2] || 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png' };
/* three.js makes every object's, geometry's and material's uuid from Math.random (4 calls each): served to the tests, it draws
   them from a stream of its own (window.__uuidRandom, harness.js), so a model with a part more does not reshuffle every scenario */
const UUID_RAND = /Math\.random\(\)\*4294967295\|0/g, UUID_N = 4;   // (the four in three's generateUUID: not all found, a new three.js minified another way: it answers 500, the page fails)
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]), file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    if (url === '/js/three.min.js') {
      let n = 0; data = data.toString('utf8').replace(UUID_RAND, () => (n++, '(self.__uuidRandom||Math.random)()*4294967295|0'));
      if (n !== UUID_N) { console.error(`serve.js: three.js's uuid calls not found (${n} of ${UUID_N}): update UUID_RAND`); res.writeHead(500); return res.end('uuid calls not found'); }
    }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
