#!/bin/bash
# BCE hook: track file activity
# Called by Claude Code as a PostToolUse hook.
# Claude Code passes hook input as JSON on stdin, not positional args.
# See: https://code.claude.com/docs/en/hooks.md
COORDINATOR_URL="${COORDINATOR_URL:-http://localhost:3100}"
AGENT_ID="${COORDINATOR_AGENT_ID:-unknown}"
AGENT_NAME="${COORDINATOR_AGENT_NAME:-unknown}"

INPUT=$(cat 2>/dev/null)
if [ -z "$INPUT" ]; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // ""' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

curl -s --max-time 1 -X POST "$COORDINATOR_URL/api/log-file" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg aid "$AGENT_ID" \
    --arg aname "$AGENT_NAME" \
    --arg tool "$TOOL_NAME" \
    --arg file "$FILE_PATH" \
    '{session_id: $sid, agent_id: $aid, agent_name: $aname, tool_name: $tool, file: $file}')" \
  >/dev/null 2>&1 &
