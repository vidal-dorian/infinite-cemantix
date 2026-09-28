// Télécharge le modèle word2vec utilisé par Cémantix (≈ 106 Mo) et vérifie son empreinte.
// Source : dépôt Amodio/cemantbot, version "stripped" du modèle frWac de J.-P. Fauconnier
// réduite aux 55 402 mots acceptés par Cémantix.
import { createWriteStream, existsSync, mkdirSync, renameSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const URL_MODEL = 'https://media.githubusercontent.com/media/Amodio/cemantbot/main/models/frWac_no_postag_phrase_500_cbow_cut10_stripped.bin';
const SHA256 = 'a6c1be2d04c7072bfbf9b053b937648f95fc57a2a85183a6364a7f6f3ee92587';

const dir = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const out = process.env.MODEL_PATH || join(dir, 'model.bin');
mkdirSync(dirname(out), { recursive: true });

function sha(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (existsSync(out) && sha(out) === SHA256) {
  console.log('Modèle déjà présent et valide :', out);
  process.exit(0);
}

console.log('Téléchargement du modèle…');
const res = await fetch(URL_MODEL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const tmp = out + '.part';
await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
const h = sha(tmp);
if (h !== SHA256) throw new Error(`Empreinte inattendue : ${h}`);
renameSync(tmp, out);
console.log('Modèle prêt :', out);
