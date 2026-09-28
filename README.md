# Sémantix ∞

Clone de [Cémantix](https://cemantix.certitudes.org) jouable **en illimité** : une nouvelle partie tire un nouveau mot secret, autant de fois que tu veux.

## Fidélité au vrai jeu

| Élément | Cémantix | Ici |
|---|---|---|
| Modèle | word2vec frWac de J.-P. Fauconnier | le même : `frWac_no_postag_phrase_500_cbow_cut10`, version réduite aux 55 402 mots acceptés par Cémantix ([Amodio/cemantbot](https://github.com/Amodio/cemantbot), 97 % de correspondance mesurée sur 55 402 mots) |
| Score | similarité cosinus | identique |
| Température | cosinus × 100, en °C, 2 décimales | identique |
| Progression | rang ‰ dans les 1000 mots les plus proches (secret = 1000, plus proche voisin = 999) | identique |
| Vocabulaire | lemmes seulement (infinitif, masculin singulier) | identique, + rattrapage des accents oubliés quand il n'y a pas d'ambiguïté |
| Émojis | 🧊 🥶 😎 🥵 🔥 😱 🥳 | 🧊 < 0 °C · 🥶 hors top 1000 · 😎 1–899 ‰ · 🥵 ≥ 900 ‰ · 🔥 ≥ 990 ‰ · 😱 999 ‰ · 🥳 trouvé |

Les seuils d'émojis ne sont pas documentés officiellement : ils sont reconstitués à partir des résultats partagés par les joueurs.

**Ce qui diffère** : le pool de mots secrets. Cémantix choisit ses mots à la main ; ici, `words/secrets.txt` contient 5 884 noms, verbes et adjectifs courants, filtrés avec le lexique [Lefff](https://github.com/ClaudeCoulombe/FrenchLefffLemmatizer) (sans noms propres, adverbes ni mots-outils) et la fréquence [wordfreq](https://github.com/rspeer/wordfreq). Tu peux éditer ce fichier librement (un mot par ligne ; les mots absents du modèle sont ignorés).

## Lancer

### Docker (Raspberry Pi, NAS…)

```bash
docker compose up -d --build
# → http://<ip>:3000
```

Au premier démarrage, le modèle (106 Mo) est téléchargé dans `./data` et son empreinte SHA-256 est vérifiée. RAM utilisée : ~250 Mo au chargement, ~130 Mo ensuite.

### Sans Docker (Node ≥ 18, aucune dépendance npm)

```bash
npm run download-model
npm start
```

Variables : `PORT` (3000), `DATA_DIR` (`./data`), `MODEL_PATH`, `GAME_KEY` (clé hex 32 octets ; sinon générée dans `data/secret.key`).

### Version 100 % statique

```bash
npm run build-static -- 600 3   # 600 mots secrets, 3 par fichier
# → dist-static/ (~52 Mo), déployable sur n'importe quel hébergement statique
```

Chaque mot secret embarque la température exacte (au centième de °C) de tous les mots du vocabulaire et l'ordre exact du top 1000 : même résultat que le serveur, mais avec un nombre fini de mots secrets.

## API

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/new` | – | `{ token }` |
| `POST /api/guess` | `{ game, word }` | `{ word, s, p, found }` ou `{ error: "unknown" }` |
| `POST /api/giveup` | `{ game }` | `{ word }` |
| `POST /api/nearby` | `{ game, word }` | top 1000, seulement si `word` est le mot secret |

Le jeton de partie est l'index du mot secret chiffré en AES-256-GCM : le serveur ne stocke aucune partie, et le jeton ne révèle rien du mot. L'historique des essais et les statistiques restent dans le `localStorage` du navigateur.

## Structure

```
server/model.js      lecture du binaire word2vec, normalisation, cosinus
server/game.js       règles : score, classement top 1000, jetons
server/index.js      serveur HTTP (node:http, sans dépendance)
public/              interface (HTML/CSS/JS vanilla)
scripts/             téléchargement du modèle, build statique
words/secrets.txt    mots secrets possibles
```

## Crédits

- Jeu original : Cémantix, par enigmathix.
- Modèle : Jean-Philippe Fauconnier, *French Word Embeddings* (2015), CC-BY 3.0 — https://fauconnier.github.io/#data
- Version réduite du modèle : Amodio/cemantbot.
- Lexique : Lefff 3.4 (LGPL-LR).
