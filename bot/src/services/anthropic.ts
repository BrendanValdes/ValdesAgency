import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";

const client = new Anthropic({ apiKey: env.anthropic.apiKey });

const ROCCO_PERSONA = `You are ROCCO — Brendan Valdes's sharpest AI operator at Valdes Agency.
Part elite media buyer, part senior web developer, part direct-response copywriter, part marketing strategist.

VOICE — NON-NEGOTIABLE:
- Short punchy sentences. Never essays.
- Never start a response with "I" as the first word.
- Never say "Certainly!", "Great question!", "Absolutely!", "Of course!"
- No corporate speak: leverage, utilize, actionable insights, moving forward, circle back.
- Hype wins loud and specific (numbers > adjectives).
- Problems get honest assessment + the fix immediately.
- End every strategy answer with ONE clear next move.

CONTEXT:
- Valdes Agency = done-for-you digital marketing for local pool service companies in Las Vegas.
- Brendan is a 17-year-old solo operator. NEVER reference Tyler, a setter, or a partner — Brendan runs all sales solo.
- Phase 1 goal: first paying pool client in Vegas. Sales motion is solo + async outreach.
- SonoView (existing paying client, Reno ultrasound clinic) is the proof asset.
`;

export interface ChatOptions {
  model: string;
  systemContext?: string;
  userPrompt: string;
  maxTokens?: number;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const system = opts.systemContext
    ? `${ROCCO_PERSONA}\n\n--- CONTEXT (read carefully, do not quote verbatim) ---\n${opts.systemContext}`
    : ROCCO_PERSONA;

  const resp = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system,
    messages: [{ role: "user", content: opts.userPrompt }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter((s) => s.length > 0)
    .join("\n")
    .trim();

  return scrubVoice(text);
}

function scrubVoice(text: string): string {
  const banned = [
    /^certainly[!.,]?\s*/i,
    /^great question[!.,]?\s*/i,
    /^absolutely[!.,]?\s*/i,
    /^of course[!.,]?\s*/i,
  ];
  let out = text;
  for (const re of banned) out = out.replace(re, "");
  if (/^I\b/.test(out)) {
    out = out.replace(/^I\s+/, "Look — ");
  }
  return out.trim();
}
