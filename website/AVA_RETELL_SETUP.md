# Ava Retell agent configuration

Repository code exposes the web-call session and three server-side tools. The Retell dashboard still must be configured with the production URLs and behavior below.

## Agent behavior and dynamic variables

Configure `RETELL_AGENT_ID` as a published web-call-capable agent. Its prompt should use these string variables when present: `{{website_intent}}`, `{{scheduling_context}}`, `{{visitor_timezone}}`, `{{visitor_first_name}}`, `{{business_description}}`, `{{visitor_email}}`, `{{visitor_phone}}`, `{{selected_date}}`, and `{{current_datetime_utc}}`.

For `scheduling_alternative`, acknowledge that the displayed options did not work and do not ask again for supplied identity, contact, or business fields. Confirm the visitor's chosen live slot before booking.

## Function authentication

Create a dashboard secret and set the same value as server-only `RETELL_FUNCTION_SECRET`. Every function must send `x-valdes-integration-secret: <RETELL_FUNCTION_SECRET>` and `Content-Type: application/json`. Replace the domain below if the production origin differs.

## `save_lead_to_valdes_crm`

- Method and production URL: `POST https://valdesagency.com/api/retell/contact`
- Payload mode: `args_at_root: true`
- Call once the required identity fields are known. It uses GHL upsert to avoid unnecessary duplicate contacts and returns `contactId`; retain that for booking.
- Configure the response variable `crm_contact_id` with the JSON path `contactId`.

Use this exact parameter schema. `business_name` and `last_name` are optional because the endpoint accepts both without them.

```json
{
  "type": "object",
  "required": ["first_name", "email", "phone", "channel"],
  "properties": {
    "first_name": {
      "type": "string",
      "description": "The caller's confirmed first name."
    },
    "last_name": {
      "type": "string",
      "description": "The caller's confirmed last name, when available."
    },
    "email": {
      "type": "string",
      "description": "The caller's confirmed email address."
    },
    "phone": {
      "type": "string",
      "description": "The caller's confirmed E.164 or NANP phone number."
    },
    "business_name": {
      "type": "string",
      "description": "The caller's confirmed business name, when available."
    },
    "channel": {
      "type": "string",
      "const": "voice"
    }
  }
}
```

## `get_available_strategy_call_times`

- Method and production URL: `POST https://valdesagency.com/api/retell/availability`
- Payload mode: `args_at_root: true`
- This reads `GHL_CALENDAR_ID`. Never offer a time absent from the returned `slots` array.

Use this exact parameter schema. The endpoint accepts at most 14 search days and returns at most 10 slots.

```json
{
  "type": "object",
  "required": ["timezone", "startOffsetDays", "searchDays", "maxSlots"],
  "properties": {
    "timezone": {
      "type": "string",
      "description": "The caller's IANA timezone, such as America/Los_Angeles, America/Denver, America/Chicago, or America/New_York. Use this same timezone for booking."
    },
    "startOffsetDays": {
      "type": "integer",
      "minimum": 0,
      "maximum": 14,
      "description": "The number of days from now to begin the availability search."
    },
    "searchDays": {
      "type": "integer",
      "minimum": 1,
      "maximum": 14,
      "description": "The number of calendar days to search. Use 1 for a specific day."
    },
    "maxSlots": {
      "type": "integer",
      "minimum": 2,
      "maximum": 10,
      "description": "The maximum number of live slots to return."
    }
  }
}
```

The success response contains `ok`, `timezone`, `slotCount`, `slots`, and `searchRange`. Each `slots` item contains an exact `startTime` and a human-readable `displayTime`.

For “Friday morning around 8,” calculate Friday's offset from `current_datetime_utc` in `visitor_timezone`, use `searchDays: 1`, then offer only returned morning slots closest to 8. If none match, ask permission to search nearby dates or ranges. Never fabricate availability.

## `book_strategy_call`

- Method and production URL: `POST https://valdesagency.com/api/retell/book`
- Payload mode: `args_at_root: true`
- Call only after the visitor explicitly chooses a returned availability slot and `save_lead_to_valdes_crm` returns `contactId`.

Use this exact parameter schema. All three parameters are required.

```json
{
  "type": "object",
  "required": ["contact_id", "start_time", "timezone"],
  "properties": {
    "contact_id": {
      "type": "string",
      "const": "{{crm_contact_id}}",
      "description": "The Valdes Agency CRM contact ID returned by save_lead_to_valdes_crm."
    },
    "start_time": {
      "type": "string",
      "format": "date-time",
      "description": "The exact startTime selected by the caller from get_available_strategy_call_times. Preserve the complete returned value, including its timezone offset. Do not calculate, modify, estimate, or invent an appointment time."
    },
    "timezone": {
      "type": "string",
      "description": "The same IANA timezone string used for get_available_strategy_call_times."
    }
  }
}
```

The endpoint re-checks GHL free slots immediately before creating the appointment and returns HTTP 409 if it is no longer free. On 409, look up availability again. Never override the calendar or invent a replacement. If no suitable slot exists, collect the preference for human review and do not call booking.

## Webhook and post-call analysis

Set the webhook URL to `POST https://valdesagency.com/api/retell/webhook` and subscribe to `call_analyzed`. Retell supplies `x-retell-signature`; code verifies it with `RETELL_API_KEY`.

Configure analysis fields as needed: `business_name`, `industry`, `company_size`, `monthly_inbound_lead_volume`, `estimated_missed_calls_per_month`, `average_customer_value`, `current_crm`, `current_lead_response_process`, `primary_problem`, `decision_maker_status`, `implementation_timeframe`, `qualification_score`, `qualification_result`, `qualification_reason`, `appointment_booked`, and `crm_contact_id`.

Retain the contact tool's ID as Retell dynamic/collected variable `crm_contact_id` so the webhook attaches notes to the right contact.

## Write gate

`AVA_EXTERNAL_WRITES_ENABLED=true` is intentionally required in production for contact, appointment, and post-call CRM writes. When false, those routes fail safely; availability remains read-only.
