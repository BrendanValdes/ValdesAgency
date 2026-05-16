import type { Client } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { chat } from "../services/anthropic.js";
import { buildPipelineSnapshot } from "../services/ghl.js";
import { loadAllSkills } from "../services/skills.js";
import { formatCurrency } from "../utils/format.js";
import { postToChannel } from "./daily-brief.js";

export async function runWeeklyAudit(client: Client): Promise<void> {
  const snapshot = await buildPipelineSnapshot();
  const skills = await loadAllSkills();

  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const weekEnd = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const pipelineBlock = snapshot
    ? [
        `Pipeline: ${snapshot.pipelineName}`,
        `Open: ${snapshot.openCount} opps / ${formatCurrency(snapshot.totalValue)}`,
        `New this week: ${snapshot.newThisWeek} | Won: ${snapshot.wonThisWeek} | Lost: ${snapshot.lostThisWeek}`,
        "Stage breakdown:",
        ...snapshot.byStage.map(
          (s) => `  - ${s.stage}: ${s.count} / ${formatCurrency(s.value)}`,
        ),
      ].join("\n")
    : "GHL fetch failed — flag this in the report and recommend reconnecting.";

  const context = Object.entries(skills)
    .map(([name, body]) => `--- skills/${name}.md ---\n${body}`)
    .join("\n\n");

  const userPrompt = `Week of ${weekStart} – ${weekEnd}.

Pipeline snapshot:
${pipelineBlock}

Write a 500-800 word weekly audit. Structure:

**ROCCO Weekly Audit — ${weekStart} → ${weekEnd}**

**Pipeline read** (3-5 lines, numbers + diagnosis)

**Wins** (bullets — what worked + why)

**Losses / drags** (bullets — what stalled + the root cause, not symptoms)

**Anti-pattern check**
- Cross-reference skills/lessons-learned.md §4. Call out any pattern we hit this week.

**Recommendations for next week** (3-5 bullets — each starts with a verb, includes a metric to hit)

**Top priority for Monday** (ONE thing — Brendan's first move at 2:30pm)

Hard rules:
- Voice: ROCCO. Short sentences. No corporate speak.
- Never start a sentence with "I" as the first word.
- Solo operator — never reference Tyler, a setter, or a partner.
- 500-800 words total. Cut fluff.`;

  const text = await chat({
    model: env.models.audit,
    systemContext: context,
    userPrompt,
    maxTokens: 2200,
  });

  await postToChannel(client, env.channels.weeklyAudit, text);
  log.info("weekly_audit_posted", { length: text.length });
}
