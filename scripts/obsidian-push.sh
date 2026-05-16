#!/usr/bin/env bash
# obsidian-push.sh — push a quick note from CLI into memory/obsidian/ via GitHub API.
# Usage:
#   ./scripts/obsidian-push.sh "Note title" "Note body"
#   ./scripts/obsidian-push.sh "Note title" -          # read body from stdin
# Loads OBSIDIAN_GITHUB_TOKEN from .env (or environment if already exported).

set -euo pipefail

REPO_OWNER="BrendanValdes"
REPO_NAME="ValdesAgency"
BRANCH="main"
TARGET_DIR="memory/obsidian"

# --- args ---------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  echo "usage: $0 \"title\" \"body\"   (or use - as body to read stdin)" >&2
  exit 64
fi
TITLE="$1"
BODY="$2"
if [[ "$BODY" == "-" ]]; then
  BODY="$(cat)"
fi

# --- load token ---------------------------------------------------------
if [[ -z "${OBSIDIAN_GITHUB_TOKEN:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/../.env"
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
fi
if [[ -z "${OBSIDIAN_GITHUB_TOKEN:-}" ]]; then
  echo "error: OBSIDIAN_GITHUB_TOKEN not set (env or .env)" >&2
  exit 1
fi

# --- slug + filename ----------------------------------------------------
TODAY="$(date -u +%Y-%m-%d)"
SLUG="$(echo "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
  | cut -c1-60)"
if [[ -z "$SLUG" ]]; then SLUG="untitled"; fi
FILENAME="${TODAY}-${SLUG}.md"
TARGET_PATH="${TARGET_DIR}/${FILENAME}"

# --- assemble markdown --------------------------------------------------
MARKDOWN="$(printf -- '---\ndate: %s\ntitle: %s\nsource: cli\n---\n\n%s\n' \
  "$TODAY" "$TITLE" "$BODY")"

# --- base64 (portable: linux uses -w0, macOS rejects it) ----------------
if base64 --help 2>&1 | grep -q -- '-w'; then
  ENCODED="$(printf '%s' "$MARKDOWN" | base64 -w 0)"
else
  ENCODED="$(printf '%s' "$MARKDOWN" | base64 | tr -d '\n')"
fi

# --- build request body via python (avoids JSON-escape footguns) --------
JSON_BODY="$(python3 -c '
import json, sys
title, encoded, branch = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "message": f"obsidian: {title}",
    "content": encoded,
    "branch": branch
}))
' "$TITLE" "$ENCODED" "$BRANCH")"

# --- PUT to GitHub Contents API -----------------------------------------
API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TARGET_PATH}"

RESPONSE="$(curl --silent --show-error --fail-with-body \
  --request PUT \
  --header "Authorization: Bearer ${OBSIDIAN_GITHUB_TOKEN}" \
  --header "Accept: application/vnd.github+json" \
  --header "X-GitHub-Api-Version: 2022-11-28" \
  --header "Content-Type: application/json" \
  --data "${JSON_BODY}" \
  "${API_URL}")" || {
    echo "error: GitHub API request failed" >&2
    echo "${RESPONSE:-(no response body)}" >&2
    exit 1
}

# --- extract + print html_url -------------------------------------------
URL="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["content"]["html_url"])')"
echo "✓ pushed → $URL"
