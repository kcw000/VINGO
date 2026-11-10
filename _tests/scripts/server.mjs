import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { repo } from '../paths.mjs';

// Only application assets are served. No directory listing or arbitrary paths.
const assets = new Map([
  ['/VINGO/', ['index.html', 'text/html; charset=utf-8']],
  ['/VINGO/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/VINGO/ogp.png', ['ogp.png', 'image/png']],
]);
const server = http.createServer(async (req, res) => {
  const entry = assets.get(new URL(req.url, 'http://127.0.0.1').pathname);
  if (!['GET', 'HEAD'].includes(req.method) || !entry) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(path.join(repo, entry[0]));
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end('Asset unavailable');
  }
});
server.listen(4178, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
