#!/usr/bin/env bash
# essaim-runner — mission headless : clone la cible, lance le swarm, route les findings.
# Usage: entrypoint.sh <raid|gardien>
set -euo pipefail
MISSION="${1:?mission requise: raid|gardien}"
: "${TARGET_REPO:?}" "${COORDINATOR_URL:?}" "${COORDINATOR_TOKEN:?}" "${GH_TOKEN:?}"
AGENTS="${ESSAIM_AGENTS:-3}"
TIMEOUT="${ESSAIM_TIMEOUT_MIN:-25}"
WORK=/home/runner/work && mkdir -p "$WORK" && cd "$WORK"

echo "::essaim-runner:: clone ${TARGET_REPO}"
gh repo clone "$TARGET_REPO" target -- --depth 50
cd target
git config user.name "essaim-runner" && git config user.email "essaim-runner@mekova.dev"

case "$MISSION" in
  raid)
    BRIEF="Chasse nocturne autonome sur ${TARGET_REPO}. Cherche les bugs réels (logique, valeurs nulles, conditions limites) dans le code source du repo. Chaque bug confirmé = test de repro qui ÉCHOUE, commité sur ta branche + résumé de cause racine dans ton thread. NE CORRIGE RIEN."
    essaim run mekova-bughunt -p . --agents "$AGENTS" \
      --coordinator-url "$COORDINATOR_URL" --timeout "$TIMEOUT" \
      --set "user-brief.brief=${BRIEF}"
    # Findings → issues : une par branche de chasseur ayant des commits
    BASE=$(git rev-parse origin/HEAD 2>/dev/null || git rev-parse main)
    for BR in $(git branch --list 'mini-project-*' | tr -d ' +*'); do
      N=$(git log --oneline "$BASE".."$BR" 2>/dev/null | wc -l) || N=0
      [ "$N" -gt 0 ] || continue
      git push origin "$BR:essaim/findings-$(date +%Y%m%d)-${BR#mini-project-}" || true
      TITLE=$(git log -1 --format=%s "$BR")
      gh issue create --repo "$TARGET_REPO" \
        --title "essaim raid: ${TITLE}" \
        --body "Finding du raid nocturne essaim ($(date +%F)). Test de repro sur la branche \`essaim/findings-$(date +%Y%m%d)-${BR#mini-project-}\`. Traiter via /debug-feedback → /plan-feedback." || true
    done
    ;;
  gardien)
    essaim run mekova-review -p . \
      --coordinator-url "$COORDINATOR_URL" --timeout "$TIMEOUT" \
      --set "user-brief.brief=Audit hebdomadaire autonome de ${TARGET_REPO}. Revue contre les conventions du repo (CLAUDE.md). Classification Local/Pattern/Convention gap. Écris AUDIT.md."
    if [ -s AUDIT.md ]; then
      gh issue create --repo "$TARGET_REPO" \
        --title "essaim gardien: audit hebdomadaire $(date +%F)" \
        --body-file AUDIT.md || true
    fi
    ;;
  *) echo "mission inconnue: $MISSION" >&2; exit 2 ;;
esac
echo "::essaim-runner:: mission ${MISSION} terminée"
