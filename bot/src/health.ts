import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { env } from "./env.js";
import { log } from "./logger.js";
import { imagesDir } from "./services/image-cards.js";

const started = Date.now();
let discordReady = false;

export function markDiscordReady(): void {
  discordReady = true;
}

// Gate 6 card serving: /i/<token>.jpg streams from STATE_DIR/images. The
// random base64url filename is the access token; the strict pattern means
// no path traversal is expressible. IG's media container fetches these URLs.
const IMAGE_ROUTE = /^\/i\/([A-Za-z0-9_-]{20,24}\.jpg)$/;

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
    const img = req.url?.match(IMAGE_ROUTE);
    if (img?.[1]) {
      const stream = createReadStream(join(imagesDir(), img[1]));
      stream.on("open", () => {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        stream.pipe(res);
      });
      stream.on("error", () => {
        res.writeHead(404);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(env.http.port, () => {
    log.info("health_server_listening", { port: env.http.port });
  });
}
