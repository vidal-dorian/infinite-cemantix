// Serveur HTTP sans dépendance : API de jeu + fichiers statiques.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, createReadStream, statSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model } from './model.js';
import { Games } from './game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(root, 'data');
const PUBLIC = join(root, 'public');
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.MODEL_PATH || join(DATA, 'model.bin');

if (!existsSync(MODEL)) {
  console.error(`Modèle introuvable : ${MODEL}\nLance d'abord : npm run download-model`);
  process.exit(1);
}

// Clé de chiffrement des jetons de partie, conservée pour survivre aux redémarrages.
const keyFile = join(DATA, 'secret.key');
mkdirSync(DATA, { recursive: true });
let key;
if (process.env.GAME_KEY) key = Buffer.from(process.env.GAME_KEY, 'hex');
else if (existsSync(keyFile)) key = readFileSync(keyFile);
else { key = randomBytes(32); writeFileSync(keyFile, key); }

const t0 = Date.now();
const model = new Model(MODEL);
const secrets = readFileSync(join(root, 'words', 'secrets.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const games = new Games(model, secrets, key);
console.log(`Modèle chargé : ${model.n} mots × ${model.d} dimensions en ${Date.now() - t0} ms, ${games.secrets.length} mots secrets possibles`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/new' && req.method === 'POST') return send(res, 200, games.newGame());
    if (p === '/api/guess' && req.method === 'POST') {
      const b = await readBody(req);
      const r = games.guess(b.game, String(b.word || '').slice(0, 60));
      return send(res, r.error === 'game' ? 400 : 200, r);
    }
    if (p === '/api/giveup' && req.method === 'POST') {
      const b = await readBody(req);
      return send(res, 200, games.giveUp(b.game));
    }
    if (p === '/api/nearby' && req.method === 'POST') {
      const b = await readBody(req);
      return send(res, 200, games.nearby(b.game, String(b.word || '')));
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    // Fichiers statiques
    const file = normalize(join(PUBLIC, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
});

server.listen(PORT, () => console.log(`Sémantix ∞ sur http://localhost:${PORT}`));
