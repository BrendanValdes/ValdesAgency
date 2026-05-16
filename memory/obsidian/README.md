# memory/obsidian/ — ROCCO's inbound notes

Anything Brendan dumps here gets auto-loaded into ROCCO's context at every new Claude Code session via the `SessionStart` hook in `.claude/settings.json`. Use it as a write-once inbox — ROCCO reads it on startup, you don't need to ask.

## How to add a note

**From the laptop terminal:**
```bash
./scripts/obsidian-push.sh "Idea title" "Body of the note. Can be long."
# or read body from stdin
echo "long body here" | ./scripts/obsidian-push.sh "Idea title" -
```

**From the iPhone:**
Build the `ROCCO Note` Shortcut once following `ROCCO-Note-setup.md`. After that: lock-screen tap or "Hey Siri, ROCCO Note" → type/dictate title → type/dictate body → file lands here in ~2 seconds.

## How to delete a note

Just `git rm memory/obsidian/<filename>` and commit. Or delete it on GitHub web. ROCCO will stop seeing it on the next session.

## Naming convention

Files are auto-named `YYYY-MM-DD-{slug}.md` by both the CLI script and the iOS Shortcut. Don't rename them — the date prefix lets the SessionStart hook order them deterministically.
