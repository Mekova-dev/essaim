# deploy/ — image essaim-runner

Ce dossier contient tout ce qui est nécessaire pour construire et exécuter
l'image Docker `essaim-runner`, utilisée pour lancer les missions autonomes
`raid` (chasse aux bugs nocturne) et `gardien` (audit hebdomadaire) sur les
repos cibles Mekova.

## Rôle de la branche `deploy`

Ce repo (`Mekova-dev/essaim`) est un **fork deploy-only** de
[`swoofer/essaim`](https://github.com/swoofer/essaim) (voir ADR-0018 du
workspace Mekova).

- **`main`** est un **miroir strict de l'upstream** `swoofer/essaim`. Il ne
  reçoit **jamais** de commit direct : toute évolution du code source
  d'essaim se fait en amont, chez `swoofer/essaim`, puis `main` est
  resynchronisé depuis l'upstream.
- **`deploy`** est la branche où vit tout le contenu spécifique à Mekova
  nécessaire au déploiement : Dockerfile, entrypoint, manifests, scripts
  d'exploitation. Elle est créée à partir de `main` et rebasée /
  resynchronisée périodiquement quand `main` avance.

**Règle impérative : ne jamais committer sur `main`.** Tout le travail de
déploiement, de configuration ou d'opération autour d'essaim se fait
exclusivement sur `deploy` (ou une branche dérivée de `deploy`).

## Contenu

- `Dockerfile` — build multi-stage : clone `swoofer/essaim` au ref pinné
  (`ESSAIM_REF`, indépendant du checkout local), build npm, packaging en
  `.tgz`, puis image finale avec `essaim`, `gh` et `claude` (Claude Code)
  installés.
- `entrypoint.sh` — point d'entrée de l'image. Usage :
  `entrypoint.sh <raid|gardien>`. Clone le repo cible (`TARGET_REPO`), lance
  le swarm essaim correspondant, puis route les findings vers des issues
  GitHub sur le repo cible.

## Build local

```bash
docker build --build-arg ESSAIM_REF=<sha|tag> -t essaim-runner:dev deploy/
```

## Variables d'environnement attendues à l'exécution

| Variable | Rôle | Défaut |
|---|---|---|
| `TARGET_REPO` | Repo cible à auditer/raider (ex. `Mekova-dev/gluten-free-price-comparer-code`) | requis |
| `COORDINATOR_URL` | URL du mcp-coordinator | requis |
| `COORDINATOR_TOKEN` | Token d'authentification coordinator | requis |
| `GH_TOKEN` | Token GitHub (clone + création d'issues) | requis |
| `CLAUDE_CODE_OAUTH_TOKEN` (ou `ANTHROPIC_API_KEY`) | Authentification Claude Code | requis |
| `ESSAIM_AGENTS` | Nombre d'agents pour la mission `raid` | `3` |
| `ESSAIM_TIMEOUT_MIN` | Timeout de la mission en minutes | `25` |

## Note sur les labels GitHub

`entrypoint.sh` ne pose pas de label sur les issues créées (`gh issue
create`) : les labels `type:bug` / `type:chore` attendus par la convention
Mekova n'existent pas encore dans le repo pilote
(`Mekova-dev/gluten-free-price-comparer-code`), qui ne dispose que des
labels GitHub par défaut. À réintroduire avec `--label` dès que ces labels
seront créés dans les repos cibles.
