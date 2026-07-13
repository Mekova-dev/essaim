#!/usr/bin/env bash
# essaim-runner — mission headless : clone la cible, lance le swarm, route les findings.
# Usage: entrypoint.sh <raid|gardien>
set -euo pipefail
MISSION="${1:?mission requise: raid|gardien}"
: "${TARGET_REPO:?}" "${COORDINATOR_URL:?}" "${COORDINATOR_TOKEN:?}" "${GH_TOKEN:?}"
AGENTS="${ESSAIM_AGENTS:-3}"
TIMEOUT="${ESSAIM_TIMEOUT_MIN:-25}"
WORK=/home/runner/work && mkdir -p "$WORK" && cd "$WORK"

# ── Dédup entre runs ───────────────────────────────────────────────────────────
# Le raid re-clone le repo à neuf chaque nuit et retrouve les mêmes bugs — ils sont
# toujours là, personne n'a eu le temps de les corriger. Sans garde-fou, il ROUVRE
# la même issue et RE-POUSSE une branche, chaque nuit, indéfiniment : ~1000 branches
# et autant d'issues en double par an et par repo. Le runner devient un générateur
# de bruit, donc un outil mort.
#
# La dédup ne peut pas reposer sur le titre : il vient du message de commit de
# l'agent, qui reformule le même bug différemment d'une nuit à l'autre. On pose donc
# une EMPREINTE stable dans le corps de l'issue et on la relit avant d'écrire.

FP_MARKER="essaim-fp"

# Empreinte d'une branche de chasseur. Priorité au trailer `Essaim-Target:` que le
# brief impose (le FICHIER FAUTIF, lui, ne change pas de nom d'une nuit à l'autre).
# Repli sur les fichiers touchés par la branche si l'agent ne l'a pas posé.
fingerprint_branch() {
  local br="$1" base="$2" target payload
  # `|| true` : sous `set -euo pipefail`, `head -1` ferme le tuyau et fait sortir
  # `git log` en SIGPIPE (141) → pipefail propage → set -e tuerait le run entier.
  target=$(git log "$base".."$br" --format=%B \
    | sed -n 's/^[[:space:]]*Essaim-Target:[[:space:]]*//p' \
    | head -1 | tr -d '\r' | sed 's/[[:space:]]*$//' || true)

  if [ -n "$target" ]; then
    payload="target:${target}"
  else
    payload="files:$(git diff --name-only "$base".."$br" | LC_ALL=C sort | tr '\n' ',')"
  fi
  printf '%s' "$payload" | sha256sum | cut -c1-12
}

# Numéro de l'issue OUVERTE portant cette empreinte, vide sinon.
#
# On LISTE puis on filtre localement au lieu d'utiliser `--search` : l'index de
# recherche GitHub est éventuellement cohérent, une issue fraîchement créée peut
# n'y apparaître qu'au bout de plusieurs minutes. Un `--search` nous ferait donc
# recréer le doublon qu'on cherche justement à éviter. (`--jq` est intégré à gh,
# pas besoin du binaire jq dans l'image.)
open_issue_for_fp() {
  local fp="$1"
  gh issue list --repo "$TARGET_REPO" --state open --limit 300 \
    --json number,body \
    --jq "[.[] | select((.body // \"\") | contains(\"${FP_MARKER}: ${fp}\"))] | .[0].number // empty" \
    2>/dev/null || true
}

echo "::essaim-runner:: clone ${TARGET_REPO}"
gh repo clone "$TARGET_REPO" target -- --depth 50
cd target
git config user.name "essaim-runner" && git config user.email "essaim-runner@mekova.dev"

case "$MISSION" in
  raid)
    BRIEF="Chasse nocturne autonome sur ${TARGET_REPO}. Cherche les bugs réels (logique, valeurs nulles, conditions limites) dans le code source du repo. Chaque bug confirmé = test de repro qui ÉCHOUE, commité sur ta branche + résumé de cause racine dans ton thread. NE CORRIGE RIEN. Termine le message de commit de ton test par une ligne seule \`Essaim-Target: <chemin du fichier source fautif>\` (ex: \`Essaim-Target: src/report.ts\`) — c'est ce qui permet de reconnaître un bug DÉJÀ signalé les nuits précédentes et de ne pas rouvrir la même issue."

    essaim run mekova-bughunt -p . --agents "$AGENTS" \
      --coordinator-url "$COORDINATOR_URL" --timeout "$TIMEOUT" \
      --set "user-brief.brief=${BRIEF}"

    # Findings → issues : une par branche de chasseur ayant des commits.
    BASE=$(git rev-parse origin/HEAD 2>/dev/null || git rev-parse main)
    for BR in $(git branch --list 'mini-project-*' | tr -d ' +*'); do
      N=$(git log --oneline "$BASE".."$BR" 2>/dev/null | wc -l) || N=0
      [ "$N" -gt 0 ] || continue

      FP=$(fingerprint_branch "$BR" "$BASE")
      EXISTING=$(open_issue_for_fp "$FP")

      if [ -n "$EXISTING" ]; then
        # Déjà signalé et toujours ouvert. On ne rouvre RIEN et on ne pousse RIEN :
        # une issue ouverte dit déjà « ce bug existe ». Commenter chaque nuit
        # (« toujours présent ») serait le même spam sous une autre forme.
        echo "::essaim-runner:: doublon (fp=${FP}) — déjà suivi dans #${EXISTING}, rien à faire"
        continue
      fi

      BRANCH="essaim/findings-$(date +%Y%m%d)-${BR#mini-project-}"
      git push origin "$BR:$BRANCH" || true
      TITLE=$(git log -1 --format=%s "$BR")
      gh issue create --repo "$TARGET_REPO" \
        --title "essaim raid: ${TITLE}" \
        --body "$(cat <<EOF
Finding du raid nocturne essaim ($(date +%F)).

Test de repro sur la branche \`${BRANCH}\`. Traiter via /debug-feedback → /plan-feedback.

<!-- ${FP_MARKER}: ${FP} — empreinte de dédup : tant que cette issue reste ouverte,
     le raid ne rouvrira pas le même finding. Ne pas retirer cette ligne. -->
EOF
)" || true
    done
    ;;

  gardien)
    essaim run mekova-review -p . \
      --coordinator-url "$COORDINATOR_URL" --timeout "$TIMEOUT" \
      --set "user-brief.brief=Audit hebdomadaire autonome de ${TARGET_REPO}. Revue contre les conventions du repo (CLAUDE.md). Classification Local/Pattern/Convention gap. Écris AUDIT.md."

    if [ -s AUDIT.md ]; then
      # Un seul fil d'audit ouvert à la fois. Tant que l'audit précédent n'est pas
      # traité, le suivant s'y ajoute en commentaire au lieu d'ouvrir un jumeau —
      # 52 issues d'audit par an sur un repo que personne n'a eu le temps de nettoyer
      # n'aide personne.
      FP="gardien-audit"
      EXISTING=$(open_issue_for_fp "$FP")

      if [ -n "$EXISTING" ]; then
        echo "::essaim-runner:: audit ouvert (#${EXISTING}) — ajout en commentaire"
        gh issue comment "$EXISTING" --repo "$TARGET_REPO" \
          --body "$(printf '## Audit du %s\n\n%s' "$(date +%F)" "$(cat AUDIT.md)")" || true
      else
        gh issue create --repo "$TARGET_REPO" \
          --title "essaim gardien: audit hebdomadaire $(date +%F)" \
          --body "$(printf '%s\n\n<!-- %s: %s — un seul fil d'"'"'audit ouvert à la fois. Ne pas retirer cette ligne. -->' "$(cat AUDIT.md)" "$FP_MARKER" "$FP")" || true
      fi
    fi
    ;;

  *) echo "mission inconnue: $MISSION" >&2; exit 2 ;;
esac
echo "::essaim-runner:: mission ${MISSION} terminée"
