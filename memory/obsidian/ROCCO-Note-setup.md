# ROCCO Note — iOS Shortcut setup (build once, use forever)

This shortcut pushes a note from your iPhone directly into `memory/obsidian/` in the ValdesAgency repo. ROCCO sees the note automatically on the next Claude Code session start — no copy/paste, no opening a laptop.

**Time to build:** ~5 minutes. **Companion JSON:** `ROCCO-Note.shortcut-config.json` (open it side-by-side on iPad or print it).

---

## Before you start

1. **Rotate `OBSIDIAN_GITHUB_TOKEN`** at https://github.com/settings/personal-access-tokens. The previous token was exposed in a Claude conversation. The new token needs **Contents: Read and write** scope on the `BrendanValdes/ValdesAgency` repo. Save the new token in 1Password / Bitwarden.
2. Update `.env` locally with the new token (`OBSIDIAN_GITHUB_TOKEN=...`).
3. Open the Shortcuts app on iPhone. Tap **+** to create a new shortcut. Name it **ROCCO Note**.

---

## Build the 13 actions

Each step below corresponds to one action in the Shortcuts editor. Add them in order. Variable names in `{curly braces}` are Shortcuts variable pills — type the variable name, then tap the suggestion bar to insert the pill.

### Step 1 — Ask for Input
- Action: **Ask for Input**
- Input Type: **Text**
- Prompt: `Note title`
- Tap the **Magic Variable** that appears after → rename to **noteTitle**

### Step 2 — Ask for Input (the body)
- Action: **Ask for Input**
- Input Type: **Text**
- Prompt: `Note body (long-press to dictate)`
- Tap **Show More** → toggle **Allow Multiple Lines** ON
- Rename Magic Variable to **noteBody**

### Step 3 — Get Current Date
- Action: **Date** → **Date** (no params)
- Rename Magic Variable to **now**

### Step 4 — Format Date
- Action: **Format Date**
- Date: **{now}**
- Date Format: **Custom** → `yyyy-MM-dd`
- Time Format: **None**
- Rename Magic Variable to **today**

### Step 5 — Replace Text (build slug, part 1: replace non-alphanumerics)
- Action: **Replace Text**
- Find Text: `[^A-Za-z0-9]+`
- Replace With: `-`
- Toggle **Regular Expression** ON
- Toggle **Case Sensitive** OFF
- Text: **{noteTitle}**
- Rename Magic Variable to **slugRaw**

### Step 6 — Change Case (slug part 2: lowercase)
- Action: **Change Case**
- Case: **lowercase**
- Text: **{slugRaw}**
- Rename Magic Variable to **slug**

### Step 7 — Text (build filename)
- Action: **Text**
- Content: `{today}-{slug}.md` (use variable pills, not literal text)
- Rename Magic Variable to **filename**

### Step 8 — Text (build the markdown body with frontmatter)
- Action: **Text**
- Content (use variable pills wherever there's a `{...}`):
  ```
  ---
  date: {today}
  title: {noteTitle}
  source: ios
  ---

  {noteBody}
  ```
- Rename Magic Variable to **fullMarkdown**

### Step 9 — Base64 Encode
- Action: **Base64 Encode**
- Encode/Decode: **Encode**
- Input: **{fullMarkdown}**
- Rename Magic Variable to **encodedBody**

### Step 10 — Dictionary (build the JSON request body)
- Action: **Dictionary**
- Tap **Add new item** three times:
  - Key: `message`, Type: Text, Value: `obsidian: {noteTitle}`
  - Key: `content`, Type: Text, Value: `{encodedBody}`
  - Key: `branch`, Type: Text, Value: `main`
- Rename Magic Variable to **requestBody**

### Step 11 — Get Contents of URL  🔑 ← TOKEN GOES HERE
- Action: **Get Contents of URL**
- URL: `https://api.github.com/repos/BrendanValdes/ValdesAgency/contents/memory/obsidian/{filename}` (filename = variable pill)
- Method: **PUT**
- Tap **Headers** → Add four:
  - `Authorization` = `Bearer ` followed by the **real token you just rotated** (paste from 1Password). **THIS IS THE ONLY PLACE THE TOKEN LIVES.**
  - `Accept` = `application/vnd.github+json`
  - `X-GitHub-Api-Version` = `2022-11-28`
  - `Content-Type` = `application/json`
- Request Body: **JSON** → tap the value field → choose **{requestBody}** from the variable picker
- Rename Magic Variable to **apiResponse**

> ⚠️ **The token never leaves your phone.** It is not in the JSON file in the repo. It is not in any backup. If you replace your phone, you re-paste it during shortcut restore. If your phone is lost, rotate the token immediately.

### Step 12 — Get Dictionary Value
- Action: **Get Dictionary Value**
- Get: **Value**
- Key: `content.html_url`
- Dictionary: **{apiResponse}**
- Rename Magic Variable to **htmlUrl**

### Step 13 — Show Notification
- Action: **Show Notification**
- Title: `ROCCO note saved`
- Body: `{filename}`
- Toggle **Play Sound** ON

---

## Wire up the triggers

After saving, tap the shortcut info icon (ⓘ) and:
- **Add to Home Screen** — for one-tap access
- **Add to Apple Watch** — quick capture from the wrist
- **Show in Share Sheet** — share text from any app into a note
- **Set up "Hey Siri"** — say "Hey Siri, ROCCO Note" → it asks for title + body verbally

---

## Test it

1. Run the shortcut. Title: `Test From iPhone`. Body: `iphone works`.
2. Wait for the notification (should fire in <3 seconds).
3. Open `https://github.com/BrendanValdes/ValdesAgency/tree/main/memory/obsidian` in Safari.
4. You should see `2026-05-16-test-from-iphone.md` (or today's date).
5. Open it — frontmatter + body should render correctly.

If the notification fires but the file isn't there: check action 11's Authorization header — easiest mistake is forgetting the literal word `Bearer ` before the token.

---

## Maintenance

- **Rotate the token monthly.** Open Shortcuts → ROCCO Note → tap action 11 → replace Authorization value.
- **If you change repos** (move ValdesAgency to a new owner, etc.), update action 11's URL.
- **If you want to delete notes from iPhone**, that's a separate shortcut — not built yet. For now use `git rm` from the laptop.
