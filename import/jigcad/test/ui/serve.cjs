// A static server for dist/ (used by shoot.cjs): node test/ui/serve.cjs [port]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.gz': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain' };
function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}
module.exports = { serve };
if (require.main === module) serve(+process.argv[2] || 8765).then(s => console.log(`serving dist/ on http://127.0.0.1:${s.address().port}`));
