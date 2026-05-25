/**
 * Single source of truth for site copy. Sections 1 + footer are LOCKED
 * (carried over from holding page + minor additions). Sections 2-10 lock
 * after Gate A approval — initially populated with the ROCCO-picked drafts
 * from memory/website/copy-draft-v1.md.
 *
 * Any change here must pass valdes.yaml banned_words + banned_structures.
 * The underlying CRM platform is never named in user-visible copy.
 */

export interface SectionCopy {
  headline: string;
  subhead?: string;
  body?: string;
  bullets?: string[];
  ctaLabel?: string;
}

export const CTA_LABEL = "Book a Free Strategy Call";

export const HERO = {
  badge: "Las Vegas",
  badgeRight: "MMXXVI",
  wordmarkTop: "Valdes",
  wordmarkBottom: "Agency",
  positioning: "Marketing systems for service businesses.",
  email: "hello@valdesagency.com",
  phone: "702.523.8826",
  phoneHref: "+17025238826",
  appointmentText: "Strategy calls by appointment",
} as const;

export const SECTION_2_WHO: SectionCopy = {
  headline: "Built for local service businesses.",
  subhead: "We work with service operators who care how their business shows up online.",
  body: "All local service businesses.",
  ctaLabel: CTA_LABEL,
};

export const SECTION_3_WEBSITES: SectionCopy = {
  headline: "Sites that book the call.",
  subhead: "Not brochures. Conversion machines.",
  body:
    "Built fast, built mobile-first, built to push a visitor toward the phone or the booking widget on every scroll. Real conversion architecture, not a designer's portfolio piece. Loads under 2 seconds on a cracked Android.",
  bullets: [
    "Mobile-first, fast loading",
    "Conversion-focused design from the first wireframe",
    "Built around how your buyers actually behave",
    "Connected to your Valdes Agency platform",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_4_SOCIAL: SectionCopy = {
  headline: "Posts that build the brand while you work.",
  subhead: "Content, calendar, comments. Handled.",
  body:
    "Three posts a day across the platforms your customers actually use. Written in your voice, planned a month out, published on the right time of day. You see the posts before they go live. We handle everything else.",
  bullets: [
    "Content, posting, engagement handled by your team",
    "Consistent presence without you posting daily",
    "Real engagement, not vanity metrics",
    "Tied directly to lead generation",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_5_FUNNEL: SectionCopy = {
  headline: "Pages that turn ad clicks into booked jobs.",
  subhead: "Landing pages, lead capture, nurture sequences.",
  body:
    "A clicked ad is a question. A funnel is the answer. We design pages that match the ad copy exactly so the visitor never wonders if they're in the right place. Then we follow up automatically until they book or unsubscribe.",
  bullets: [
    "Landing pages built for conversion",
    "Lead capture that actually captures",
    "Automated nurture sequences run on your platform",
    "Track every step from click to close",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_6_CRM: SectionCopy = {
  headline: "Automations that chase the leads you forget about.",
  subhead: "Powered by your Valdes Agency platform.",
  body:
    "Every lead that hits your business gets a phone call attempt, a text, and an email within 5 minutes. Then a 7-day nurture sequence. Then a 30-day re-engagement. You set the rules once. The platform runs it forever.",
  bullets: [
    "Custom pipelines built around your business",
    "Automated follow-up on every lead within 5 minutes",
    "Workflows that handle the busywork",
    "All running on your Valdes Agency platform",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_7_AI_TEAM: SectionCopy = {
  headline: "AI that works your business while you sleep.",
  subhead: "A team of AI agents trained on your business.",
  body:
    "They answer leads, qualify them, book the first call, send the reminders, and tell you what happened in the morning. The work humans used to do, done at machine speed, never asking for a raise.",
  bullets: [
    "Pulls leads in 24/7 without you watching",
    "Follows up on every lead automatically",
    "Books calls into your calendar without human intervention",
    "Sends weekly reports and drafts content while you sleep",
    "You wake up to results, not tasks",
    "Your AI team feeds your Command Center",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_8_COMMAND_CENTER: SectionCopy = {
  headline: "Your whole business. In your pocket.",
  subhead: "One platform. One dashboard. One mobile app.",
  body:
    "Lead inbox. Calendar. Automations. Reports. AI assistant. All in one place, on your desktop and on your phone. Built on the Valdes Agency platform. Manage the business from a job site, from a truck, from anywhere. The end of switching between five apps to run one company.",
  bullets: [
    "Every lead, conversation, automation in one dashboard",
    "Mobile app connected to your command center",
    "Manage your entire business from your phone",
    "Your team, your data, your control",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_9_REPORTS: SectionCopy = {
  headline: "Senior strategy. On the calendar.",
  subhead: "Plus a weekly report you'll actually read.",
  body:
    "Every Monday, a one-page report lands in your inbox. Numbers, what moved, what we're doing about it. Twice a month, a 30-minute strategy call. Direct line to the work. No account manager filtering the truth.",
  bullets: [
    "Weekly performance reports delivered to your platform",
    "2 strategy calls per month with senior input",
    "No black-box agency relationships",
    "You always know what's happening",
  ],
  ctaLabel: CTA_LABEL,
};

export const SECTION_10_SYNERGY: SectionCopy = {
  headline: "Every system feeds the others.",
  subhead: "The whole thing. Connected.",
  body:
    "Your website pulls leads. Your AI team follows up. Your dashboard tells you what's working. Your strategy calls keep it sharp.",
  ctaLabel: CTA_LABEL,
};

export const FOOTER = {
  wordmark: "VALDES",
  tagline: "Marketing systems for service businesses. Las Vegas.",
  copyright: "© 2026 Valdes Agency",
  year: "MMXXVI",
} as const;
