/**
 * Single source of truth for site copy — "Growth Engine" build.
 *
 * Layout reference: create.video (alternating light/dark, bold type, clean
 * feature cards). Every section is label / headline / body / tag pills / visual.
 *
 * Copy rules (enforced by hand here): no em-dashes anywhere; no banned
 * buzzwords (leverage, unlock, game-changer, seamless, revolutionary). The
 * underlying CRM platform is never named in user-visible copy.
 */

export interface SectionCopy {
  /** Small-caps eyebrow above the headline. */
  label: string;
  headline: string;
  subhead?: string;
  body?: string;
  /** Pill chips under the body (replaces the old bullet list). */
  tags?: string[];
  ctaLabel?: string;
}

/** Placeholders — swap real URLs when they exist. */
export const VIDEO_EMBED_URL = ""; // e.g. "https://player.vimeo.com/video/XX…"
export const CALENDLY_URL = "#"; // e.g. "https://calendly.com/valdesagency/20min"

export const CONTACT = {
  email: "hello@valdesagency.com",
  phone: "702.523.8826",
  phoneHref: "+17025238826",
} as const;

/* ------------------------------------------------------------------ */
/* Section 1 — Hero                                                    */
/* ------------------------------------------------------------------ */

export const HERO = {
  pill: "For Home Service Businesses",
  headline: "The Valdes Growth Engine",
  subhead: "We build the system. You run the business.",
  formCta: "See If You Qualify",
  videoLabel: "Watch the 90-second walkthrough",
  successHeadline: "You're in.",
  successBody: "Brendan will reach out within 24 hours to see if it's a fit.",
} as const;

export const BUSINESS_TYPE_OPTIONS = [
  "Pool",
  "HVAC",
  "Pest Control",
  "Landscaping",
  "Garage Door",
  "Other",
] as const;

export const BUDGET_OPTIONS = [
  "Under $500",
  "$500-$1000",
  "$1000-$2500",
  "$2500+",
] as const;

/* ------------------------------------------------------------------ */
/* Sections 2-8 — service blocks (label / headline / body / tags)      */
/* ------------------------------------------------------------------ */

export const SECTION_GET_FOUND: SectionCopy = {
  label: "Get Found",
  headline: "Show up when they search.",
  body: "We build you a fast, professional website and optimize it so the right customers find you first.",
  tags: ["Website Design", "Local SEO", "Google Business Profile"],
};

export const SECTION_BE_EVERYWHERE: SectionCopy = {
  label: "Be Everywhere",
  headline: "Reach the right customers before your competitors do.",
  body: "Targeted Google and Meta ads that put your business in front of homeowners actively looking for your service.",
  tags: ["Google Ads", "Meta Ads"],
};

export const SECTION_NEVER_MISS: SectionCopy = {
  label: "Never Miss a Lead",
  headline: "Every lead answered in minutes. None slip through.",
  body: "Ava, your AI receptionist, answers calls, texts back missed calls, qualifies leads, and books appointments 24/7.",
  tags: ["AI Receptionist", "Missed Call Text Back", "24/7 Coverage"],
};

export const SECTION_LEAD_CAPTURE: SectionCopy = {
  label: "Agentic System",
  headline: "Every lead followed up. Every deal tracked.",
  body: "Your CRM captures every inquiry, triggers follow-up sequences automatically, and keeps your pipeline moving without you lifting a finger.",
  tags: ["CRM Pipeline", "Auto Follow-Up", "Lead Scoring"],
};

export const SECTION_CONTENT: SectionCopy = {
  label: "CONTENT THAT KEEPS YOU TOP OF MIND",
  headline: "Stay visible.\nWin the next call.",
  body: "Your content system turns real pool-service work into polished posts, captions, and updates that keep your business active and recognizable—without adding another task to your day.",
  tags: ["More Local Visibility", "Consistent Posting", "Less Owner Work"],
};

export const SECTION_COMMAND_CENTER: SectionCopy = {
  label: "Command Center",
  headline: "Every conversation. Every lead. One place.",
  body: "All your calls, texts, emails, and bookings live in one dashboard. Nothing gets missed. Nothing falls through the cracks.",
  tags: ["Unified Inbox", "Appointment Booking", "Full Visibility"],
};

export const SECTION_REPORTS: SectionCopy = {
  label: "Visibility Layer",
  headline: "You always know what is working.",
  body: "Monthly reports show exactly where your leads come from and what they cost. Strategy calls turn the numbers into the next move.",
  tags: ["Monthly Reports", "Strategy Calls", "ROI Tracking"],
};

/* ------------------------------------------------------------------ */
/* Section 9 — Timeline                                                */
/* ------------------------------------------------------------------ */

export const TIMELINE = {
  label: "What to Expect",
  headline: "From zero to running in 30 days.",
  phases: [
    { when: "Week 1-2", title: "Build and Setup" },
    { when: "Week 3", title: "Go Live" },
    { when: "Week 4", title: "First Leads" },
    { when: "Month 2+", title: "Optimize and Scale" },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Section 10 — Bottom CTA                                             */
/* ------------------------------------------------------------------ */

export const BOTTOM_CTA = {
  headline: "Ready to stop guessing and start growing?",
  subhead: "Book a free 20-minute call. No pitch. Just a plan.",
  buttonLabel: "Book Your Call",
} as const;

export const FOOTER = {
  wordmark: "VALDES",
  tagline: "Marketing systems for home service businesses. Las Vegas.",
  copyright: "© 2026 Valdes Agency",
} as const;
