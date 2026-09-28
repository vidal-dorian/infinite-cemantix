// Chargement du modèle word2vec (format binaire Mikolov) et calculs de similarité.
// Modèle : frWac_no_postag_phrase_500_cbow_cut10 (J.-P. Fauconnier), version "stripped"
// à 55 402 mots, celle qui correspond au vocabulaire accepté par Cémantix.
import { readFileSync } from 'node:fs';

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export class Model {
  constructor(path) {
    const buf = readFileSync(path);
    let pos = buf.indexOf(0x0a);
    const [n, d] = buf.toString('utf8', 0, pos).trim().split(/\s+/).map(Number);
    pos += 1;
    this.n = n;
    this.d = d;
    this.words = new Array(n);
    this.index = new Map();
    this.vectors = new Float32Array(n * d); // vecteurs normalisés (norme 1)

    for (let i = 0; i < n; i++) {
      while (buf[pos] === 0x0a) pos++;
      const sp = buf.indexOf(0x20, pos);
      const word = buf.toString('utf8', pos, sp);
      pos = sp + 1;
      const off = i * d;
      let norm = 0;
      for (let k = 0; k < d; k++) {
        const v = buf.readFloatLE(pos + 4 * k);
        this.vectors[off + k] = v;
        norm += v * v;
      }
      norm = Math.sqrt(norm);
      for (let k = 0; k < d; k++) this.vectors[off + k] /= norm;
      pos += 4 * d;
      this.words[i] = word;
      this.index.set(word, i);
    }

    // Index sans accents, utilisé seulement si la saisie exacte est inconnue
    // et que la forme sans accent correspond à un seul mot du vocabulaire.
    const loose = new Map();
    for (const w of this.words) {
      const k = stripAccents(w);
      loose.set(k, loose.has(k) ? null : w);
    }
    this.loose = loose;
  }

  /** Renvoie l'index du mot, ou -1 s'il est inconnu. */
  lookup(raw) {
    const w = raw.trim().toLowerCase().replace(/[’']/g, "'");
    if (this.index.has(w)) return this.index.get(w);
    const alt = this.loose.get(stripAccents(w));
    return alt ? this.index.get(alt) : -1;
  }

  /** Similarité cosinus entre deux mots (vecteurs déjà normalisés). */
  cosine(i, j) {
    const d = this.d, a = i * d, b = j * d, v = this.vectors;
    let s = 0;
    for (let k = 0; k < d; k++) s += v[a + k] * v[b + k];
    return s;
  }

  /** Similarités du mot i avec tout le vocabulaire. */
  allCosines(i) {
    const { n, d, vectors: v } = this;
    const out = new Float32Array(n);
    const a = i * d;
    for (let j = 0; j < n; j++) {
      const b = j * d;
      let s = 0;
      for (let k = 0; k < d; k++) s += v[a + k] * v[b + k];
      out[j] = s;
    }
    return out;
  }
}
