// Sémantix ∞ — interface de jeu. Le « backend » est interchangeable :
// - serveur Node (API /api/*) par défaut ;
// - window.SEMANTIX_BACKEND si défini (version statique précalculée).
(() => {
  'use strict';

  const httpBackend = {
    async post(path, body) {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      return r.json();
    },
    newGame() { return this.post('/api/new'); },
    guess(token, word) { return this.post('/api/guess', { game: token, word }); },
    giveUp(token) { return this.post('/api/giveup', { game: token }); },
    nearby(token, word) { return this.post('/api/nearby', { game: token, word }); },
  };
  const api = window.SEMANTIX_BACKEND || httpBackend;

  // ---------- Stockage local (tolérant aux erreurs) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  // ---------- Règles d'affichage (identiques à Cémantix) ----------
  const temp = (s) => (Math.round(s * 10000) / 100);
  const fmtTemp = (s) => temp(s).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function category(g) {
    if (g.found || g.p === 1000) return { emoji: '🥳', cls: 'c-win', key: 'win' };
    if (g.p >= 999) return { emoji: '😱', cls: 'c-hot', key: 'scream' };
    if (g.p >= 990) return { emoji: '🔥', cls: 'c-hot', key: 'fire' };
    if (g.p >= 900) return { emoji: '🥵', cls: 'c-warm', key: 'hot' };
    if (g.p >= 1) return { emoji: '😎', cls: 'c-mild', key: 'cool' };
    if (g.s >= 0) return { emoji: '🥶', cls: 'c-cold', key: 'cold' };
    return { emoji: '🧊', cls: 'c-freeze', key: 'ice' };
  }
  const keycap = (n) => String(n).split('').map((d) => d + '️⃣').join('');

  // ---------- État ----------
  let state = store.get('semantix.game', null);
  let stats = store.get('semantix.stats', { played: 0, won: 0, tries: 0, best: null, streak: 0 });
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('guess-form'), input: $('guess'), send: $('btn-send'), msg: $('msg'),
    latest: $('latest'), rows: $('rows'), empty: $('empty'), result: $('result'),
    nearby: $('nearby'), nearbyRows: $('nearby-rows'), stats: $('stats'),
    label: $('game-label'), giveup: $('btn-giveup'), newBtn: $('btn-new'),
  };

  function save() { store.set('semantix.game', state); store.set('semantix.stats', stats); }

  function say(text, error = false) {
    el.msg.textContent = text;
    el.msg.classList.toggle('error', error);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function rowHtml(g, flash = false) {
    const c = category(g);
    const bar = g.p
      ? `<div class="bar"><div class="track"><div class="fill" style="width:${Math.max(1, g.p / 10)}%"></div></div><span class="num">${g.p}</span></div>`
      : '';
    return `<tr${flash ? ' class="flash"' : ''}><td class="n">${g.n}</td><td class="w">${esc(g.word)}</td>` +
      `<td class="t ${c.cls}">${fmtTemp(g.s)}</td><td class="e" aria-label="${c.key}">${c.emoji}</td><td class="p">${bar}</td></tr>`;
  }

  function render(flashWord) {
    const gs = state ? state.guesses : [];
    el.label.textContent = `Partie n° ${state ? state.id : stats.played + 1}`;
    el.empty.hidden = gs.length > 0;
    const last = gs.find((g) => g.word === state.latest);
    el.latest.innerHTML = last ? rowHtml(last, flashWord === last.word) : '';
    const sorted = [...gs].sort((a, b) => b.s - a.s);
    el.rows.innerHTML = sorted.map((g) => rowHtml(g)).join('');

    const over = state && state.status !== 'playing';
    el.input.disabled = over;
    el.send.disabled = over;
    el.giveup.disabled = over || !state;
    renderResult();
    renderStats();
  }

  function shareText() {
    const counts = {};
    for (const g of state.guesses) { const k = category(g).emoji; counts[k] = (counts[k] || 0) + 1; }
    const order = ['😱', '🔥', '🥵', '😎', '🥶', '🧊'];
    const parts = order.filter((e) => counts[e]).map((e) => e + keycap(counts[e]));
    const n = state.guesses.length;
    return state.status === 'won'
      ? `J'ai trouvé le mot de #SémantixIllimité (partie ${state.id}) en ${n} coup${n > 1 ? 's' : ''} ! 🥳 ${parts.join(' ')}`
      : `J'ai abandonné #SémantixIllimité (partie ${state.id}) après ${n} coup${n > 1 ? 's' : ''}. ${parts.join(' ')}`;
  }

  function renderResult() {
    if (!state || state.status === 'playing') { el.result.hidden = true; return; }
    const n = state.guesses.length;
    const won = state.status === 'won';
    el.result.classList.toggle('lost', !won);
    el.result.innerHTML = `
      <h2>${won ? `Bravo ! Le mot était « ${esc(state.secret)} »` : `Le mot était « ${esc(state.secret)} »`}</h2>
      <p>${won ? `Trouvé en ${n} coup${n > 1 ? 's' : ''}.` : `Partie abandonnée après ${n} coup${n > 1 ? 's' : ''}.`}</p>
      <div class="share-text" id="share-text">${esc(shareText())}</div>
      <div class="row">
        <button type="button" class="primary" id="btn-again">Nouvelle partie</button>
        <button type="button" id="btn-share">Copier le résultat</button>
        <button type="button" id="btn-nearby">${el.nearby.hidden ? 'Voir les mots proches' : 'Masquer les mots proches'}</button>
      </div>`;
    el.result.hidden = false;
    $('btn-again').onclick = newGame;
    $('btn-share').onclick = copyShare;
    $('btn-nearby').onclick = toggleNearby;
  }

  function renderStats() {
    const avg = stats.won ? (stats.tries / stats.won).toFixed(1).replace('.', ',') : '–';
    el.stats.innerHTML = [
      [stats.played, 'parties'], [stats.won, 'trouvés'], [avg, 'coups moy.'], [stats.best ?? '–', 'record'],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  async function copyShare() {
    const text = shareText();
    try { await navigator.clipboard.writeText(text); say('Résultat copié.'); }
    catch {
      const r = document.createRange(); r.selectNodeContents($('share-text'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      say('Texte sélectionné : copiez-le avec votre appareil.');
    }
  }

  async function toggleNearby() {
    if (!el.nearby.hidden) { el.nearby.hidden = true; renderResult(); return; }
    const r = await api.nearby(state.token, state.secret);
    if (!r || !r.list) { say('Impossible de charger les mots proches.', true); return; }
    const guessed = new Set(state.guesses.map((g) => g.word));
    el.nearbyRows.innerHTML = r.list.map((x) => {
      const c = category(x);
      const w = guessed.has(x.word) ? `<strong>${esc(x.word)}</strong> ✓` : esc(x.word);
      return `<tr><td class="n">${x.p}</td><td class="w" style="font-weight:400">${w}</td><td class="t ${c.cls}">${fmtTemp(x.s)}</td></tr>`;
    }).join('');
    el.nearby.hidden = false;
    renderResult();
  }

  async function newGame() {
    if (busy) return;
    busy = true;
    try {
      // Une partie en cours sans aucun essai est simplement remplacée.
      if (state && state.status === 'playing' && state.guesses.length > 0) {
        stats.played += 1; stats.streak = 0;
      }
      const r = await api.newGame();
      state = { token: r.token, id: (store.get('semantix.counter', 0) + 1), guesses: [], status: 'playing', latest: null, secret: null };
      store.set('semantix.counter', state.id);
      el.nearby.hidden = true;
      save();
      say('');
      render();
      el.input.value = '';
      el.input.focus();
    } catch {
      say('Impossible de lancer une partie. Vérifiez la connexion au serveur.', true);
    } finally { busy = false; }
  }

  async function submitGuess(e) {
    e.preventDefault();
    const word = el.input.value.trim().toLowerCase();
    if (!word || busy || !state || state.status !== 'playing') return;
    busy = true;
    try {
      const r = await api.guess(state.token, word);
      if (r.error === 'unknown') { say(`Je ne connais pas le mot « ${word} ».`, true); el.input.select(); return; }
      if (r.error) { say('Cette partie n’est plus valide, lancez-en une nouvelle.', true); return; }
      const existing = state.guesses.find((g) => g.word === r.word);
      if (existing) {
        state.latest = existing.word;
        say(`« ${r.word} » a déjà été proposé (essai n° ${existing.n}).`);
      } else {
        state.guesses.push({ word: r.word, s: r.s, p: r.p, found: r.found, n: state.guesses.length + 1 });
        state.latest = r.word;
        say(r.word !== word ? `Compris : « ${r.word} ».` : '');
      }
      if (r.found) {
        state.status = 'won'; state.secret = r.word;
        const n = state.guesses.length;
        stats.played += 1; stats.won += 1; stats.tries += n; stats.streak += 1;
        stats.best = stats.best == null ? n : Math.min(stats.best, n);
      }
      save();
      render(r.word);
      el.input.value = '';
      if (state.status === 'playing') el.input.focus();
    } catch {
      say('Le serveur ne répond pas. Réessayez.', true);
    } finally { busy = false; }
  }

  // Abandon en deux temps : premier clic = demande de confirmation.
  let confirmTimer = null;
  async function giveUp() {
    if (!state || state.status !== 'playing') return;
    if (!confirmTimer) {
      el.giveup.textContent = 'Confirmer l’abandon';
      confirmTimer = setTimeout(() => { el.giveup.textContent = 'Abandonner'; confirmTimer = null; }, 3000);
      return;
    }
    clearTimeout(confirmTimer); confirmTimer = null; el.giveup.textContent = 'Abandonner';
    const r = await api.giveUp(state.token);
    if (!r || !r.word) { say('Impossible d’abandonner cette partie.', true); return; }
    state.status = 'lost'; state.secret = r.word;
    stats.played += 1; stats.streak = 0;
    save();
    say('');
    render();
  }

  el.form.addEventListener('submit', submitGuess);
  el.newBtn.addEventListener('click', newGame);
  el.giveup.addEventListener('click', giveUp);

  if (state && state.token) render(); else newGame();
})();
