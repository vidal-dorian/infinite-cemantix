// Génère une version 100 % statique (sans serveur) à partir du modèle :
// pour un échantillon de mots secrets, on précalcule la température de CHAQUE mot du
// vocabulaire (arrondie au centième de °C, donc identique à l'affichage) et l'ordre exact
// du top 1000. Utile pour héberger le jeu sur un hébergement statique.
//
//   node scripts/build-static.js [nombreDeMotsSecrets=600] [motsParFichier=3]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model } from '../server/model.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR || join(root, 'data');
const OUT = join(root, 'dist-static');
const COUNT = Number(process.argv[2] || 600);
const PER = Number(process.argv[3] || 3);
const TOP = 999;
const EXT = process.env.DATA_EXT || '.bin'; // extension des fichiers de données

const model = new Model(process.env.MODEL_PATH || join(DATA, 'model.bin'));
const n = model.n;
const pool = readFileSync(join(root, 'words', 'secrets.txt'), 'utf8').split('\n').map((s) => s.trim()).filter((w) => model.index.has(w));

// Échantillon reproductible (graine fixe) pour pouvoir régénérer à l'identique.
let seed = 20260928;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const chosen = pool.slice(0, COUNT);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'data'), { recursive: true });
writeFileSync(join(OUT, 'data', `vocab${EXT}`), gzipSync(Buffer.from(model.words.join('\n')), { level: 9 }));

const BLOCK = 4 + TOP * 2 + n * 2;
const packs = Math.ceil(chosen.length / PER);
for (let f = 0; f < packs; f++) {
  const words = chosen.slice(f * PER, f * PER + PER);
  const buf = Buffer.alloc(BLOCK * words.length);
  words.forEach((w, slot) => {
    const secret = model.index.get(w);
    const sims = model.allCosines(secret);
    const off = slot * BLOCK;
    buf.writeUInt32LE(secret, off);
    const order = Array.from({ length: n }, (_, i) => i).filter((i) => i !== secret).sort((a, b) => sims[b] - sims[a]);
    for (let k = 0; k < TOP; k++) buf.writeUInt16LE(order[k], off + 4 + 2 * k);
    const hi = off + 4 + 2 * TOP, lo = hi + n;
    for (let i = 0; i < n; i++) {
      const q = i === secret ? 10000 : Math.round(sims[i] * 10000);
      const u = q & 0xffff;
      buf[hi + i] = u >> 8; // octets de poids fort puis de poids faible : se compresse mieux
      buf[lo + i] = u & 0xff;
    }
  });
  writeFileSync(join(OUT, 'data', `p${f}${EXT}`), gzipSync(buf, { level: 9 }));
  process.stdout.write(`\rPaquet ${f + 1}/${packs}`);
}
console.log();

// Page unique : CSS et JS intégrés, backend statique branché avant app.js.
const pub = join(root, 'public');
const css = readFileSync(join(pub, 'style.css'), 'utf8');
const app = readFileSync(join(pub, 'app.js'), 'utf8');
const backend = readFileSync(join(root, 'scripts', 'static-backend.js'), 'utf8')
  .replace('__CONFIG__', JSON.stringify({ n, per: PER, count: chosen.length, top: TOP, ext: EXT }));
let html = readFileSync(join(pub, 'index.html'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${backend}\n</script>\n<script>\n${app}\n</script>`)
  .replace('<!--POOL-->', `Version statique : ${chosen.length} mots secrets précalculés.`);
writeFileSync(join(OUT, 'index.html'), html);
console.log(`OK : ${chosen.length} mots secrets en ${packs} fichiers → ${OUT}`);
