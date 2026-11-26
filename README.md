# Deploy

Un tableau de bord à la Vercel pour **déployer et gérer tes sites GitHub Pages**, entièrement côté navigateur : pas de serveur, pas de build, uniquement l'API GitHub.

## Fonctionnalités

- **Projets** : liste de tes dépôts, création d'un site en un clic (dépôt + page d'accueil + workflow + GitHub Pages)
- **Déploiements** : historique des runs GitHub Actions, logs, relance, annulation, rollback
- **Previews** par pull request (via `rossjrw/pr-preview-action`)
- **Fichiers** : parcours, édition et commit directement sur la branche par défaut, import de fichiers en un seul commit
- **Domaines**, **variables Actions**, **releases**, **tags**, **changelog**, **comparaison** de branches, **support** (issues), **analytics** (trafic du dépôt)

## Nouveautés

- **Thème** automatique / clair / sombre (bouton en bas à droite), **palette de commandes** (Ctrl/Cmd + K), **routage par hash** (`#deploiements`, `#fichiers`…)
- **Build automatique** : si le projet a un `package.json`, le workflow installe, lance `npm run build` et publie `dist/`, `build/`, `out/`, `public/` ou `_site/`. Réglable avec les variables Actions `BUILD_COMMAND` et `OUTPUT_DIR` (page *Variables d'environnement*). Pour un projet existant, clique « Déploiement auto » pour réinstaller le workflow. Les previews de PR sont servies sous `/pr-preview/pr-N/` : configure la `base` de ton framework si besoin.
- **Général** : renommer le projet, modifier sa description ; **Domaines** : désactiver Pages ; modèles *Lien en bio* et *En construction* ; actions dans la palette de commandes ; `.nojekyll` ajouté au build (dossiers `_next`, `_astro`…)
- Onboarding au premier lancement, squelettes de chargement, erreurs GitHub traduites

## Hébergement : GitHub Pages d'abord

Deploy fonctionne **entièrement sur GitHub Pages**, sans serveur (mode « token ») :

| Fonction | Sur GitHub Pages | Avec le backend |
| --- | --- | --- |
| Connexion | Token collé (session, ou « Rester connecté ») | + OAuth, token côté serveur |
| Secrets | Chiffrés dans le navigateur (libsodium via CDN jsDelivr) | idem, côté serveur |
| Vérification DNS | DNS-over-HTTPS (dns.google) | via le serveur |
| Alertes d'échec | Notification navigateur, onglet ouvert | + Discord/Slack en continu (webhook) |

Pour publier l'app : Réglages › Pages › Source = **GitHub Actions**, le workflow `.github/workflows/pages.yml` ne publie que les fichiers statiques. `landing.html` est la page de présentation.

## Backend (optionnel)

`npm start` ajoute l'OAuth GitHub (le token ne quitte plus le serveur), les alertes Discord/Slack en continu et les mêmes routes en version serveur. L'app détecte le backend toute seule ; sur `*.github.io` elle ne le cherche même pas.

- Crée une OAuth App (callback `BASE_URL/auth/callback`) et renseigne `.env` (voir `.env.example`), puis `npm install`.
- Alertes : webhook sur le dépôt (événement *Workflow runs*, URL `BASE_URL/webhook/github`, secret = `WEBHOOK_SECRET`) et `NOTIFY_WEBHOOK_URL`.
- Sessions en mémoire ; mets HTTPS devant. `npm test` lance les tests (Node ≥ 20). `GET /healthz` sert de sonde de santé ; les sessions expirent après 8 h.

## Lancer en local

Le projet est statique, il suffit de servir le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Dans **Paramètres › Git**, colle un [Personal Access Token](https://github.com/settings/tokens/new?scopes=repo,workflow&description=Deploy) avec les droits `repo` et `workflow` (`delete_repo` uniquement si tu veux supprimer des projets).

## Sécurité

Le token est stocké dans le `localStorage` du navigateur et n'est envoyé qu'à `api.github.com`. Comme tout secret dans le `localStorage`, il est exposé en cas de faille XSS : utilise un token à durée de vie courte et révoque-le si besoin. N'héberge pas cette app avec des scripts tiers non maîtrisés.

## Structure

```
index.html            page unique (l'app)
landing.html          page de présentation
css/shell.css         coque (navbar, header, animations)
css/views.css         vues fonctionnelles (cartes, listes, graphiques)
js/shell.js           intro, navbar, routage, palette de commandes
js/app.js             client GitHub, état, vues principales
js/project.js         sélecteur de projet, aperçu, fichiers, releases, logs…
server/server.js      backend optionnel (OAuth, proxy, secrets, DNS, webhook)
test/server.test.js   tests (npm test)
.github/workflows/    ci.yml (tests) et pages.yml (publie l'app sur GitHub Pages)
```

> Le workflow `deploy.yml` n'est **pas** dans ce dépôt : c'est le modèle que Deploy installe dans *tes projets* (voir `WF` dans `js/app.js`).

## Limites connues

- API GitHub limitée à 5 000 requêtes/h (un message l'indique quand la limite est atteinte)
- Les stats de trafic exigent un accès en écriture au dépôt
- Les dépôts sont listés sur 100 éléments maximum

## Licence

MIT
