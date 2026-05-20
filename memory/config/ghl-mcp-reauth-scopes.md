# GHL MCP — Re-Authorization Scope List

**Source:** https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html
**OAuth flow source:** https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html
**Captured:** 2026-05-20 by ROCCO via WebFetch
**Use case:** Re-authorize the GHL MCP token in this Codespace to add contact-read scopes after the 2026-05-20 diagnostic blocker. All five of these tool calls returned HTTP 401 "token is not authorized for this scope":
  - `mcp__ghl__search_contacts`
  - `mcp__ghl__get_contact`
  - `mcp__ghl__get_object_schema`
  - `mcp__ghl__get_all_objects`
  - `mcp__ghl__get_location_custom_fields`

---

## Current state (2026-05-20)
- Token DOES have workflow / pipeline write scopes (confirmed — Discord notifications + pipeline edits work in production GHL workflows).
- Token DOES NOT have contact-read or object-schema-read scopes.
- Diagnostic loops on "GHL field appears blank" cannot run via MCP. Fall back is manual UI verification — see KG entity `GHL-Contact-Card-Field-Display-Locations` and `skills/lessons-learned.md` L-019.

## Scopes to ADD on re-auth (all sourced from official docs above)

| Scope (exact string) | API endpoints granted | Unblocks MCP tool calls |
|---|---|---|
| `contacts.readonly` | `GET /contacts/:contactId`, `GET /contacts/`, `GET /contacts/business/:businessId` + contact webhook events | `mcp__ghl__search_contacts`, `mcp__ghl__get_contact`, `mcp__ghl__get_contacts_by_business`, `mcp__ghl__get_duplicate_contact` |
| `locations/customFields.readonly` | `GET /locations/:locationId/customFields`, `GET /locations/:locationId/customFields/:id`, `GET /custom-fields/:id`, `GET /custom-field/object-key/:key` | `mcp__ghl__get_location_custom_fields`, `mcp__ghl__get_location_custom_field`, `mcp__ghl__ghl_get_custom_field_by_id`, `mcp__ghl__ghl_get_custom_fields_by_object_key` |
| `objects/schema.readonly` | `GET /objects/:key`, `GET /objects` | `mcp__ghl__get_object_schema`, `mcp__ghl__get_all_objects` |
| `objects/record.readonly` | `GET /objects/:schemaKey/records/:id` | `mcp__ghl__get_object_record`, `mcp__ghl__search_object_records` |

All four scopes are **Sub-Account / Location-level** (matches our single-location MCP setup).

## Optional adjacent scopes — decide BEFORE re-auth

These are not blocking the 2026-05-20 incident but are likely useful. Confirm whether each was previously granted — minimum write footprint is safer to start:

- `contacts.write` — unblocks `bulk_update_contact_tags`, `add_contact_tags`, `update_contact`, `create_contact`, `delete_contact`, `upsert_contact`.
- `locations/customFields.write` — unblocks `create_location_custom_field`, `update_location_custom_field`, `delete_location_custom_field`.
- `objects/record.write` — unblocks `create_object_record`, `update_object_record`, `delete_object_record`.

Decision needed: add these now, or scope-creep them only when a tool call 401s? Minimum-permission default = skip until needed.

## OAuth flow (from official docs)

GoHighLevel uses the **Authorization Code Grant** flow for Marketplace apps. Re-auth steps:

1. The Marketplace app developer (Brendan) constructs the OAuth URL with the scope list above (space-separated).
   - Pattern: `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=<APP_CLIENT_ID>&redirect_uri=<REDIRECT_URI>&scope=contacts.readonly%20locations%2FcustomFields.readonly%20objects%2Fschema.readonly%20objects%2Frecord.readonly`
   - Note: `/` in scope names must be URL-encoded as `%2F`.
2. Visit the URL in a browser, log into the Valdes Agency GHL account, select the sub-account.
3. Browser redirects to the configured redirect URI with an `?code=...` parameter — capture this code.
4. Exchange code for access + refresh tokens via `POST /oauth/token` (form-urlencoded: grant_type=authorization_code, code, client_id, client_secret, redirect_uri).
5. Update the MCP server config / env vars with the new access_token and refresh_token.
6. Refresh tokens are valid up to 1 year per official docs — subsequent refreshes can be done programmatically.

## Concrete re-auth checklist (TODO at execution time)

- [ ] Confirm the Marketplace app ID + client secret + redirect URI for the Valdes Agency GHL app
- [ ] Confirm CURRENT scope list of the existing token (to know which scopes to preserve vs add — minimum write footprint default)
- [ ] Construct the OAuth URL with the additive scope list (existing scopes + the four read scopes above)
- [ ] Run the browser consent flow
- [ ] Exchange code for token via POST /oauth/token
- [ ] Update the MCP server config (location TBD — see "Uncertain items" below) with new access_token + refresh_token
- [ ] Smoke test: run `mcp__ghl__search_contacts({query: "Bob Jones", limit: 1})` — must return contact data, NOT 401
- [ ] Smoke test 2: run `mcp__ghl__get_object_schema({key: "contact"})` — must return schema, NOT 401
- [ ] Log the re-auth date + new scope set in `memory/brain-dump.md`

## Uncertain items (read before executing)

- **MCP server location.** No `.mcp.json` at repo root; no GHL-specific config in `.claude/settings.json` via grep. The MCP server lives outside the repo (likely npm-installed globally or in a config Brendan owns). Where does the new access_token get pasted? Confirm before re-auth.
- **Refresh token automation.** Some MCP packages auto-refresh; others need manual rotation. Inspect the MCP server's documented behavior before assuming.
- **Write scopes inventory.** The original token clearly has some scopes (workflow + pipeline writes work). Need to confirm the exact existing scope set during re-auth — re-auth replaces the scope grant entirely, so existing scopes must be re-included in the new request.

## Related
- KG entity `GHLImportBugFix-Batch3-CompanyName-2026-05-20` — the incident that exposed this gap
- KG entity `GHL-Contact-Card-Field-Display-Locations` — the lesson extracted
- `skills/lessons-learned.md` L-019 — anti-pattern enforcement rule
- `CLAUDE.md` GHL IMPORT WIZARD section — verification protocol that depends on either MCP reads or manual UI checks
