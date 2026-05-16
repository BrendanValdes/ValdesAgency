import { createServer } from "node:http";
import { env } from "./env.js";
import { log } from "./logger.js";

const started = Date.now();
let discordReady = false;

export function markDiscordReady(): void {
  discordReady = true;
}

export function startHealthServer(): void {
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
      const body = {
        status: discordReady ? "ok" : "starting",
        uptime_sec: Math.round((Date.now() - started) / 1000),
        discord_ready: discordReady,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(env.http.port, () => {
    log.info("health_server_listening", { port: env.http.port });
  });
}
