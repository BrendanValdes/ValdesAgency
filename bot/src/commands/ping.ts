import { SlashCommandBuilder } from "discord.js";
import { checkAllServices, type ServiceStatus } from "../services/health.js";
import type { SlashCommand } from "./types.js";

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}h ${m}m ${s}s`;
}

function fmtMem(): string {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  return `${rss}MB RSS / ${heap}MB heap`;
}

function statusBadge(s: ServiceStatus): string {
  const dot = s.status === "ok" ? "🟢" : s.status === "down" ? "🔴" : "⚪️";
  const lat = s.latencyMs !== undefined ? ` (${s.latencyMs}ms)` : "";
  const detail = s.detail ? ` — ${s.detail}` : "";
  return `${dot} ${s.name}${lat}${detail}`;
}

export const ping: SlashCommand = {
  data: new SlashCommandBuilder().setName("ping").setDescription("ROCCO liveness check"),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const uptime = fmtUptime(process.uptime());
    const memory = fmtMem();
    const ws = client.ws.ping;
    const services = await checkAllServices();

    const lines = [
      "**ROCCO online.**",
      `Uptime: ${uptime}`,
      `Memory: ${memory}`,
      `Discord WS: ${ws}ms`,
      `Node: ${process.version}`,
      "",
      "**MCP / service status:**",
      ...services.map(statusBadge),
    ];
    await interaction.editReply(lines.join("\n"));
  },
};
