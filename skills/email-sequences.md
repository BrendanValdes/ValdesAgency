Email Sequences — Full Copy
Last updated: 2026-05-17

This is the source of truth for every email body that fires from GHL automation. Edit here, then push the changes into the corresponding GHL email template. Do NOT edit copy in GHL without updating this file — the file drifts and we lose the canonical version.

CONTENTS
- Voicemail Email (fires after VM1, all niches)
- Pool Email Campaign (5 emails: 1A, 1B, 2A, 2B, Evergreen, Last) — A/B split on "pool list a" vs "pool list b"
- Pest Control Email Campaign (5 emails: 1A, 1B, 2A, 2B, Evergreen, Last) — A/B split on "pest control list a" vs "pest control list b"

Merge field convention: GHL uses `{{contact.first_name}}`, `{{contact.company_name}}`, etc. Verify exact syntax in the GHL email builder before paste.

==============================================================================
VOICEMAIL EMAIL
==============================================================================
Fires: 24hrs after "voicemail left" tag is applied (Workflow 1, VM1 branch)
Used for: ALL niches (pool, pest, handyman, etc.)

Subject: Left you a voicemail — {{contact.company_name}}

Hi {{contact.first_name}}, just tried calling you, left a quick voicemail.

I'm Brendan, I run a marketing agency here in Las Vegas. I work specifically with local service businesses, helping them get more calls from Google, look more professional online, and stop losing jobs to competitors with better websites.

Took a quick look at your business before I called. You've got a solid operation, the kind that should be dominating Google Maps in your area. A few small things are likely costing you calls every week.

Worth a 10-minute conversation to see if I can help. No pressure, just want to see if it's a fit.

Call or text me back at (702)-523-8826 or just reply here.

— Brendan Valdes, Valdes Agency

==============================================================================
POOL EMAIL CAMPAIGN
==============================================================================
Workflow: Pool Email Campaign (Workflow 4)
Trigger: Tag added — "pool email campaign"
A/B split: "pool list a" → 1A path. "pool list b" → 1B path.
Sequence: 1A or 1B → 2A or 2B → Evergreen → Last (over time delays)
Status: LIVE — 41 enrolled / 26 active

──── EMAIL 1A POOL ────
Subject: Losing jobs you don't know about?
Pre-Header: Most owners only find out when they check their reviews.

Hey, I spent a few minutes looking at {{contact.company_name}} and noticed something that most pool companies in Vegas are dealing with right now, and most of them have no idea it's costing them jobs every single month.

I put together a short video breaking down exactly what I found and how fixing it could realistically get you 5 to 8 more booked jobs a month from leads you're already getting. Want me to send it over?

-Brendan

──── EMAIL 1B POOL ────
Subject: 10 hours back every week
Pre-Header: so you can focus on the work that actually makes you money

Hey, I was looking at {{contact.company_name}} for a few minutes and had an idea that could take the most time consuming parts of running a pool business completely off your plate. The follow ups, the scheduling, the chasing people down, all of it handled automatically so you just show up and do the work.

I put it in a short video explaining how it could work for you. Want me to send it over?

-Brendan

──── EMAIL 2A POOL ────
Subject: 5-8 more booked jobs, want the video?
Pre-Header: Put it together specifically for {{contact.company_name}}

Hey, bumping this in case it got buried.

Still glad to send the video. It's 4 minutes and breaks down how pool companies in Vegas are picking up 5 to 8 more booked jobs a month from leads they already have.

Want it?

-Brendan

──── EMAIL 2B POOL ────
Subject: 10 hours back every week
Pre-Header: Put it together specifically for {{contact.company_name}}

Still glad to send over the video, it walks through how some pool companies in Vegas are clawing back 8 to 10 hours a week on admin and follow ups. Time you can put into more routes or take an actual day off. Helping you focus on what makes you money.

Want me to send it over?

-Brendan

──── EVERGREEN POOL ────
Subject: Here's that video
Pre-Header: put this together for {{contact.company_name}}

Hey figured I'd just send it over.

[Evergreen Loom Link — NEEDS TO BE RECORDED]

This breaks down exactly how pool companies in Vegas are picking up more booked jobs from leads they're already getting, and how it could work specifically for {{contact.company_name}}.

If it resonates you can reply directly or grab a free strategy call here: Schedule Strategy Call. Either way you'll leave with a tailored game plan for {{contact.company_name}} whether we work together or not.

-Brendan

──── LAST EMAIL POOL ────
Subject: This could save you 10 hours a week {{contact.first_name}}
Pre-Header: free strategy calls open through June

Hey there,

I'll get out of your inbox after this.

Free 20 minute call. I'll show you exactly how {{contact.company_name}} can book more jobs and get 10+ hours back a week. You walk away with a clearer picture whether we work together or not.

Spots are open through June: ScheduleYourStrategyCall

If now isn't the time, no worries at all.

==============================================================================
PEST CONTROL EMAIL CAMPAIGN
==============================================================================
Workflow: Pest Email Campaign (Workflow 7)
Trigger: Tag added — "pest control email campaign"
A/B split: "pest control list a" → 1A path. "pest control list b" → 1B path.
Sequence: 1A or 1B → 2A or 2B → Evergreen → Last (over time delays)
Status: LIVE — 0 enrolled (no pest control leads scraped yet)

──── EMAIL 1A PEST ────
Subject: quick thing about {{contact.company_name}}
Pre-Header: most pest companies in Vegas have this same issue

Hey {{contact.first_name}},

Most pest control companies in Vegas are leaving recurring revenue on the table every month from something on their website they don't even know is broken. Looked at {{contact.company_name}} this morning and you've got it too.

Put together a short video showing what it is and how fixing it gets pest companies 5 to 8 more recurring contracts a month from leads they already have.

Want me to send it over?

Brendan

──── EMAIL 1B PEST ────
Subject: 10 hours back every week
Pre-Header: so you can focus on the work that actually makes you money

Hey, I was looking at {{contact.company_name}} for a few minutes and had an idea that could take the most time consuming parts of running a Pest Control business completely off your plate. The follow up, the scheduling, the chasing people down, all of it handled automatically so you just show up and do the work.

Put it in a short video explaining how it works. Want me to send it over?

-Brendan

──── EMAIL 2A PEST ────
Subject: 5-8 more booked jobs, want the video?
Pre-Header: Put it together specifically for {{contact.company_name}}

Hey, bumping this in case it got buried.

Still glad to send the video. It's 4 minutes and breaks down how pest companies in Vegas are picking up 5 to 8 more recurring contracts a month from leads they already have, and how it could work for {{contact.company_name}}.

Want it?

-Brendan

──── EMAIL 2B PEST ────
Subject: 10 hours back every week
Pre-Header: Put it together specifically for {{contact.company_name}}

Still glad to send over the video, it walks through how some pest control companies in Vegas are clawing back 8 to 10 hours a week on admin and follow ups. Time you can put into more routes or take an actual day off. Helping you focus on what makes you money.

Want me to send it over?

-Brendan

──── EVERGREEN PEST ────
Subject: Here's that video
Pre-Header: put this together for {{contact.company_name}}

Hey figured I'd just send it over.

[Evergreen Loom Link — NEEDS TO BE RECORDED]

This breaks down exactly how pest control companies in Vegas are picking up more booked jobs from leads they're already getting, and how it could work specifically for {{contact.company_name}}.

If it resonates you can reply directly or grab a free strategy call here: Schedule Strategy Call. Either way you'll leave with a tailored game plan for {{contact.company_name}} whether we work together or not.

-Brendan

──── LAST EMAIL PEST ────
Subject: This could save you 10 hours a week {{contact.first_name}}
Pre-Header: free strategy calls open through June

Hey there,

I'll get out of your inbox after this.

Free 20 minute call. I'll show you exactly how {{contact.company_name}} can book more jobs and get 10+ hours back a week. You walk away with a clearer picture whether we work together or not.

Spots are open through June: ScheduleYourStrategyCall

If now isn't the time, no worries at all.

==============================================================================
TEMPLATE NOTES FOR FUTURE NICHE SEQUENCES
==============================================================================

Pool and Pest follow the same skeleton — swap the niche-specific words and angles:

1A → "loss / leak" angle (you're losing jobs/revenue you don't know about, here's the fix)
1B → "time back" angle (admin/follow-up automation, 10 hours back a week)
2A → "bump on 1A" (5-8 more booked jobs angle, still glad to send the video)
2B → "bump on 1B" (10 hours back, still glad to send the video)
Evergreen → "here's the video unprompted" (Loom link, schedule call CTA, "tailored game plan whether we work together or not")
Last → "I'll get out of your inbox" (graceful exit with free 20-min call CTA, "spots open through [month]")

When building Handyman / House Cleaning / Carpet Cleaning / Landscaping / Garage Door / HVAC sequences:
- Keep voicemail email generic (already works for all niches)
- Use Pool as the structural template
- Replace "pool companies" → "[niche] companies"
- Replace job-specific outcomes (e.g. "5-8 more booked jobs" → "5-8 more recurring contracts" for recurring-revenue niches like Pest, Landscaping, HVAC)
- Keep the (702)-523-8826 number, Brendan signoff, and Schedule Strategy Call CTA constant

==============================================================================
OUTSTANDING
==============================================================================
- Pool Evergreen Loom video — script + recording NEEDED
- Pest Evergreen Loom video — script + recording NEEDED
- Personal Loom workflow + copy — not yet drafted (slot exists in pipeline, no automation)
- Subject line A/B testing — current copy is v1, no variant test data yet
- Schedule Strategy Call link — confirm Calendly/GHL URL is live in the GHL email templates
- ScheduleYourStrategyCall link in Last Email — same check
