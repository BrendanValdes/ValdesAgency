GHL Workflow Specs — Build These In GHL
Owner: Brendan | Last updated: 2026-05-17

This file holds buildable specs for new GHL workflows and modifications to existing ones. Copy each spec directly into GHL's workflow builder.

==============================================================================
WORKFLOW 10 — VM TAG HYGIENE (NEW)
==============================================================================

Problem: Workflow 1 (Voicemail Left) fires on three tags — "voicemail left", "voicemail 2 left", "voicemail 3". If a lead gets VM1, then VM2, then VM3, all three tags stack on the contact. When VM2 is added, the trigger fires correctly to the VM2 branch, BUT on any later automation that re-checks "voicemail left" tag presence, the contact still has it. Worse, if someone manually re-applies "voicemail left" by accident, the VM1 branch re-fires and sends the voicemail email AGAIN to a lead that's already had it.

Fix: Auto-remove the older VM tag when a newer one is applied. One VM tag per contact at any time.

WORKFLOW NAME: VM Tag Hygiene

TRIGGER 1: Tag Added — "voicemail 2 left"
  Action 1: Remove Contact Tag — "voicemail left"
  END

TRIGGER 2: Tag Added — "voicemail 3"
  Action 1: Remove Contact Tag — "voicemail left"
  Action 2: Remove Contact Tag — "voicemail 2 left"
  END

Build notes:
- In GHL, this is one workflow with two separate triggers, OR two separate one-trigger workflows. Either works. One workflow is cleaner.
- Order matters: hygiene workflow must run BEFORE Workflow 1's logic. GHL evaluates triggers in parallel, but since the hygiene workflow only REMOVES tags (it doesn't ADD them), there's no race. Workflow 1's trigger fires on the NEWLY-ADDED tag, not on the removed one.
- After build: test on a dummy contact. Apply "voicemail left" → verify VM1 branch fires + email sends. Apply "voicemail 2 left" → verify "voicemail left" gets removed AND VM2 branch fires (no email). Apply "voicemail 3" → verify both prior tags removed AND VM3 branch fires.

Why this beats the manual dummy-contact test:
The manual test confirms the current bug exists but doesn't fix it. This workflow IS the fix. Build once, never worry about VM tag stacking again.

==============================================================================
WORKFLOW 7 ENHANCEMENT — CLOSED WON (MODIFY EXISTING)
==============================================================================

Current state:
- Trigger: Pipeline Stage → Closed Won
- Action 1: Discord webhook to #onboarding
- END

Missing: No "client" tag applied, no onboarding task created. Means a closed deal sits in the pipeline with no clear "this is a customer now" marker and no operator task to actually start onboarding.

NEW WORKFLOW 7 (full spec):

WORKFLOW NAME: Closed Won

TRIGGER: Pipeline Stage Changed → Sales Pipeline → Closed Won

  Action 1: Add Contact Tag — "client"

  Action 2: Send Discord Webhook → #onboarding
    Message body:
    """
    🎉 NEW CLIENT CLOSED: {{contact.first_name}} {{contact.last_name}} — {{contact.company_name}}
    Phone: {{contact.phone}}
    Email: {{contact.email}}
    Deal: {{opportunity.name}}
    Value: ${{opportunity.monetary_value}}
    Started: {{current_date}}

    Next steps:
    1. Send welcome email + contract
    2. Book onboarding call
    3. Collect access (GHL, ad accounts, website, branding)
    4. Move to "Scheduled Onboarding" stage
    """

  Action 3: Create Task — assigned to Brendan
    Title: "New client onboarding — {{contact.company_name}}"
    Description:
    """
    Closed {{current_date}}. Kickoff checklist:
    - [ ] Send welcome email + contract (DocuSign)
    - [ ] Book onboarding call (Calendly, 60 min, within 48 hrs)
    - [ ] Collect access:
        - [ ] GHL sub-account or merchant logins
        - [ ] Google Ads (MCC link request)
        - [ ] Meta Business Manager (partner access)
        - [ ] Website CMS / domain registrar
        - [ ] Brand assets (logo, photos, fonts)
    - [ ] Set up client folder in Google Drive
    - [ ] Add to weekly reporting cadence
    - [ ] Move opportunity to "Scheduled Onboarding"
    """
    Due date: +2 business days from current date

  Action 4: Move Opportunity → Sales Pipeline → Scheduled Onboarding

  END

Build notes:
- Add Action 1 first, before the existing Discord webhook. Tag should be on the contact before downstream automations or reports check for it.
- Action 4 (move to Scheduled Onboarding) prevents the deal from sitting at Closed Won forever. The Scheduled Onboarding stage is where active client onboarding lives until Onboarding Complete fires.
- If GHL's variable syntax differs from `{{contact.first_name}}` — use whatever the platform expects. Most GHL installs use this Liquid-style format but verify in the workflow builder dropdown.

Test before going live: create a dummy opportunity in Sales Pipeline, drag to Closed Won, verify:
1. Contact gets "client" tag
2. Discord message lands in #onboarding with all variables resolved
3. Task appears in Brendan's task list with correct due date
4. Opportunity is now in Scheduled Onboarding stage

==============================================================================
DEPLOYMENT ORDER
==============================================================================

1. Build Workflow 10 (VM Tag Hygiene) FIRST — protects existing automation
2. Test Workflow 10 on a dummy contact (5 min)
3. Modify Workflow 7 (Closed Won) — add the 3 missing actions
4. Test modified Workflow 7 on a dummy opportunity (5 min)
5. Update CLAUDE.md to mark both fixes as DONE (remove from KNOWN ISSUES section)

Total build time: ~20 minutes in GHL.

==============================================================================
WHEN TO UPDATE THIS FILE
==============================================================================

- New workflow needed → spec it here BEFORE building in GHL
- Existing workflow has a bug → spec the fix here, then implement
- After deployment → either mark spec as DONE inline or move to a "Shipped" section at the bottom

Keep this file as the source of truth for "what should the automation do." GHL is the runtime. This file is the design.
