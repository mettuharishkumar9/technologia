#!/usr/bin/env bash
# Linux equivalent of scheduled-scan.ps1.
# Headless invocation of /databricks-pulse via `claude -p`, with logging.
# Designed to be invoked by cron at 08:32 IST and 20:32 IST.
#
# Setup:
#   - System timezone should be Asia/Kolkata (so cron's HH:MM matches IST literally).
#   - .env at skill root provides ANTHROPIC_API_KEY (consumed by claude CLI).
#   - claude CLI installed (npm install -g @anthropic-ai/claude-code), or
#     a node script equivalent if you'd rather not depend on the global claude install.
#
# Cron entry (after `crontab -e`):
#   32 8  * * * /home/ubuntu/databricks-pulse/scripts/scheduled-scan.sh
#   32 20 * * * /home/ubuntu/databricks-pulse/scripts/scheduled-scan.sh

set -euo pipefail

# Resolve skill root from this script's location (works regardless of CWD).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SKILL_ROOT/logs"
mkdir -p "$LOG_DIR"

TODAY="$(date +%Y-%m-%d)"
LOG_FILE="$LOG_DIR/scan-$TODAY.log"
START_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"

{
  echo ""
  echo "=== Scheduled scan starting === $START_TS"
  echo "  Invoker: $0"
  echo "  Skill root: $SKILL_ROOT"
} >> "$LOG_FILE"

# Source .env so ANTHROPIC_API_KEY (and any others claude needs) are in env.
if [[ -f "$SKILL_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$SKILL_ROOT/.env"
  set +a
fi

# Find claude binary — try PATH first, then common install locations.
CLAUDE_BIN="$(command -v claude || true)"
if [[ -z "$CLAUDE_BIN" ]]; then
  for candidate in \
      "$HOME/.local/bin/claude" \
      "/usr/local/bin/claude" \
      "$HOME/.npm-global/bin/claude" \
      "/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude"; do
    if [[ -x "$candidate" ]]; then
      CLAUDE_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$CLAUDE_BIN" ]]; then
  echo "ERROR: claude CLI not found in PATH or common locations" >> "$LOG_FILE"
  exit 1
fi
echo "  Claude: $CLAUDE_BIN" >> "$LOG_FILE"

# Run the skill non-interactively, with tools pre-allowed and a budget cap.
# stderr → log file. stdout also → log (claude prints its own narration).
set +e
"$CLAUDE_BIN" \
    --print \
    --dangerously-skip-permissions \
    --add-dir "$SKILL_ROOT" \
    --max-budget-usd "3.00" \
    "/databricks-pulse" \
    >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

END_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=== Scheduled scan finished === $END_TS (exit=$EXIT_CODE)" >> "$LOG_FILE"
exit "$EXIT_CODE"
