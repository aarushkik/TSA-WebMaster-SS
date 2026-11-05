import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handle } from './app.js';
import { openDatabase } from './database.js';
import { readAssets } from './assets.js';
const db = openDatabase(process.env.DB_PATH || 'data/space-battle.sqlite');
const port = Number(process.env.PORT || 3000);
const server = createServer(async (req, res) => {
  try {
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const response = await handle(request, db, readAssets());
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('Server error'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Space Battle running at http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
