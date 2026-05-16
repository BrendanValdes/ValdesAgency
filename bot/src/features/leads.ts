import { loadLeadsFile } from "../services/skills.js";

export interface Lead {
  rank: number;
  name: string;
  score: string;
  phone?: string;
  website?: string;
  owner?: string;
  angle?: string;
}

const HEADER = /^###\s+(\d+)\.\s+(.+?)\s+—\s+Score:\s*([0-9.]+\/10)\s*$/;

export async function topLeads(count = 5): Promise<Lead[]> {
  const text = await loadLeadsFile();
  if (!text) return [];
  const lines = text.split("\n");
  const leads: Lead[] = [];
  let current: Lead | null = null;

  const push = () => {
    if (current) leads.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const m = HEADER.exec(line);
    if (m && m[1] && m[2] && m[3]) {
      push();
      current = { rank: Number.parseInt(m[1], 10), name: m[2], score: m[3] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("- **Phone:**")) {
      current.phone = line.replace("- **Phone:**", "").trim();
    } else if (line.startsWith("- **Website:**")) {
      current.website = line.replace("- **Website:**", "").trim();
    } else if (line.startsWith("- **Owner:**")) {
      current.owner = line.replace("- **Owner:**", "").trim();
    } else if (line.startsWith("- **Outreach angle:**")) {
      current.angle = line.replace("- **Outreach angle:**", "").trim().replace(/^"|"$/g, "");
    }
  }
  push();

  return leads.sort((a, b) => a.rank - b.rank).slice(0, count);
}

export function formatLeadList(leads: Lead[]): string {
  if (leads.length === 0) {
    return "No leads loaded. Confirm `memory/leads/vegas-pool-leads.md` is bundled in the deploy.";
  }
  const lines: string[] = ["**Top Vegas pool leads — ranked by ICP fit**", ""];
  for (const l of leads) {
    lines.push(`**${l.rank}. ${l.name}** — ${l.score}`);
    if (l.phone) lines.push(`  Phone: ${l.phone}`);
    if (l.owner) lines.push(`  Owner: ${l.owner}`);
    if (l.website) lines.push(`  Site: ${l.website}`);
    if (l.angle) lines.push(`  Angle: ${l.angle}`);
    lines.push("");
  }
  lines.push("**Next move:** dial #1 in the 2:30-4:30pm window today.");
  return lines.join("\n");
}

export async function findLead(query: string): Promise<Lead | null> {
  const all = await topLeads(30);
  const q = query.toLowerCase().trim();
  return (
    all.find((l) => l.name.toLowerCase().includes(q)) ??
    all.find((l) => l.name.toLowerCase().startsWith(q)) ??
    null
  );
}
