// Backend statique : lit les fichiers précalculés par build-static.js.
window.SEMANTIX_BACKEND = (() => {
  const C = __CONFIG__;
  const BLOCK = 4 + C.top * 2 + C.n * 2;

  async function gunzip(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let vocabP = null;
  function vocab() {
    if (!vocabP) {
      vocabP = gunzip(`data/vocab${C.ext}`).then((b) => {
        const words = new TextDecoder().decode(b).split('\n');
        const index = new Map(words.map((w, i) => [w, i]));
        const loose = new Map();
        for (const w of words) { const k = strip(w); loose.set(k, loose.has(k) ? null : w); }
        return { words, index, loose };
      });
    }
    return vocabP;
  }

  const packs = new Map();
  const games = new Map();
  async function game(token) {
    const g = Number(token);
    if (!Number.isInteger(g) || g < 0 || g >= C.count) throw new Error('game');
    if (games.has(g)) return games.get(g);
    const f = Math.floor(g / C.per);
    if (!packs.has(f)) packs.set(f, gunzip(`data/p${f}${C.ext}`));
    const buf = await packs.get(f);
    const off = (g % C.per) * BLOCK;
    const dv = new DataView(buf.buffer, buf.byteOffset + off, BLOCK);
    const secret = dv.getUint32(0, true);
    const top = new Uint16Array(C.top);
    const ranks = new Map();
    for (let k = 0; k < C.top; k++) { top[k] = dv.getUint16(4 + 2 * k, true); ranks.set(top[k], C.top - k); }
    const hi = buf.subarray(off + 4 + 2 * C.top, off + 4 + 2 * C.top + C.n);
    const lo = buf.subarray(off + 4 + 2 * C.top + C.n, off + BLOCK);
    const score = (i) => (((hi[i] << 8) | lo[i]) << 16 >> 16) / 10000;
    const gm = { secret, top, ranks, score };
    games.set(g, gm);
    return gm;
  }

  function lookup(v, raw) {
    const w = raw.trim().toLowerCase().replace(/[’']/g, "'");
    if (v.index.has(w)) return v.index.get(w);
    const alt = v.loose.get(strip(w));
    return alt ? v.index.get(alt) : -1;
  }

  function pick() {
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('semantix.seen') || '[]'); } catch { /* ignoré */ }
    const free = [];
    for (let g = 0; g < C.count; g++) if (!seen.includes(g)) free.push(g);
    const list = free.length ? free : Array.from({ length: C.count }, (_, g) => g);
    const g = list[Math.floor(Math.random() * list.length)];
    seen = free.length ? [...seen, g] : [g];
    try { localStorage.setItem('semantix.seen', JSON.stringify(seen)); } catch { /* ignoré */ }
    return g;
  }

  return {
    async newGame() {
      const g = pick();
      await Promise.all([vocab(), game(g)]);
      return { token: String(g) };
    },
    async guess(token, raw) {
      try {
        const [v, gm] = await Promise.all([vocab(), game(token)]);
        const i = lookup(v, raw);
        if (i < 0) return { error: 'unknown', word: raw };
        const found = i === gm.secret;
        return { word: v.words[i], s: found ? 1 : gm.score(i), p: found ? 1000 : (gm.ranks.get(i) || null), found };
      } catch { return { error: 'game' }; }
    },
    async giveUp(token) {
      const [v, gm] = await Promise.all([vocab(), game(token)]);
      return { word: v.words[gm.secret] };
    },
    async nearby(token, word) {
      const [v, gm] = await Promise.all([vocab(), game(token)]);
      if (lookup(v, word) !== gm.secret) return { error: 'locked' };
      return { word: v.words[gm.secret], list: Array.from(gm.top, (i, k) => ({ word: v.words[i], s: gm.score(i), p: C.top - k })) };
    },
  };
})();
