// Logique d'une partie : même règles que Cémantix.
//  - score s = similarité cosinus entre la proposition et le mot secret
//  - température affichée = s × 100 (°C, 2 décimales)
//  - progression p (‰) : rang parmi les 1000 mots les plus proches.
//    Le mot secret vaut 1000, son plus proche voisin 999, … le 999e voisin 1.
//    Hors top 1000 : pas de progression.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const TOP = 1000;

export class Games {
  constructor(model, secrets, key) {
    this.model = model;
    this.key = key; // 32 octets
    this.secrets = secrets
      .map((w) => model.index.get(w))
      .filter((i) => i !== undefined);
    this.cache = new Map(); // secretIndex -> { ranks: Int16Array, top: Uint16Array }
    this.cacheMax = 256;
  }

  // Jeton opaque et sans état côté serveur : l'index du mot secret chiffré (AES-256-GCM).
  newGame() {
    const secret = this.secrets[Math.floor(Math.random() * this.secrets.length)];
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.alloc(4);
    body.writeUInt32LE(secret);
    const enc = Buffer.concat([c.update(body), c.final()]);
    const token = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
    return { token };
  }

  secretOf(token) {
    try {
      const raw = Buffer.from(String(token), 'base64url');
      const d = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      const out = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
      const i = out.readUInt32LE();
      return i < this.model.n ? i : -1;
    } catch {
      return -1;
    }
  }

  ranking(secret) {
    let r = this.cache.get(secret);
    if (r) {
      this.cache.delete(secret);
      this.cache.set(secret, r); // LRU
      return r;
    }
    const sims = this.model.allCosines(secret);
    const order = new Uint32Array(sims.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => sims[b] - sims[a]);
    const ranks = new Int16Array(sims.length);
    const top = [];
    let k = 0;
    for (const idx of order) {
      if (idx === secret) continue;
      if (k >= TOP - 1) break;
      ranks[idx] = TOP - 1 - k; // 999, 998, …, 1
      top.push(idx);
      k++;
    }
    ranks[secret] = TOP;
    r = { ranks, top: Uint16Array.from(top) };
    this.cache.set(secret, r);
    if (this.cache.size > this.cacheMax) this.cache.delete(this.cache.keys().next().value);
    return r;
  }

  guess(token, raw) {
    const secret = this.secretOf(token);
    if (secret < 0) return { error: 'game' };
    const i = this.model.lookup(raw);
    if (i < 0) return { error: 'unknown', word: String(raw).trim().toLowerCase() };
    const s = i === secret ? 1 : this.model.cosine(i, secret);
    const p = this.ranking(secret).ranks[i] || null;
    return { word: this.model.words[i], s: Math.round(s * 1e6) / 1e6, p, found: i === secret };
  }

  giveUp(token) {
    const secret = this.secretOf(token);
    if (secret < 0) return { error: 'game' };
    return { word: this.model.words[secret] };
  }

  // Liste des mots proches, accessible seulement une fois le mot connu.
  nearby(token, word) {
    const secret = this.secretOf(token);
    if (secret < 0) return { error: 'game' };
    if (this.model.lookup(word) !== secret) return { error: 'locked' };
    const { top } = this.ranking(secret);
    return {
      word: this.model.words[secret],
      list: Array.from(top, (idx, k) => ({
        word: this.model.words[idx],
        s: Math.round(this.model.cosine(idx, secret) * 1e6) / 1e6,
        p: TOP - 1 - k,
      })),
    };
  }
}
