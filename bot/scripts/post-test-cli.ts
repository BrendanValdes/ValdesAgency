// Gate 6 Phase D supervised pipe test.
// ============================================================================
// Validates the IG/FB posting pipe end-to-end WITHOUT publishing anything
// public by default:
//   ig-container  — renders a card, starts an embedded HTTP server on :8765,
//                   creates an IG media container (validates public fetch +
//                   JPEG + auth). Does NOT publish. Container expires in 24h.
//   fb-unpublished — creates an UNPUBLISHED page photo post (published:false).
//   ig-publish / fb-publish — the real thing. Only with --live, supervised.
//
// Usage: PUBLIC_BASE_URL=https://... npx tsx scripts/post-test-cli.ts <mode>
// The script starts its own /i/ server — no external process needed.
// ============================================================================

import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { getBrand } from "../src/services/brand-config.js";
import {
  executeTool,
  FB_PHOTO_POST_TOOL,
  IG_CONTAINER_TOOL,
  postToFacebook,
  postToInstagram,
} from "../src/services/composio.js";
import { imagesDir, publicImageUrl, renderCardToVolume } from "../src/services/image-cards.js";
import { getState, initStateStore, mutateState } from "../src/services/state.js";
import { env } from "../src/env.js";

// Embedded image server — serves the same imagesDir() the renderer writes to.
// Keeps port 8765 for Codespaces forwarding. Strict token pattern prevents traversal.
const IMAGE_ROUTE = /^\/i\/([A-Za-z0-9_-]{20,24}\.jpg)$/;

function startImageServer(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const m = req.url?.match(IMAGE_ROUTE);
      if (m?.[1]) {
        const stream = createReadStream(`${imagesDir()}/${m[1]}`);
        stream.on("open", () => {
          res.writeHead(200, { "Content-Type": "image/jpeg" });
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
    server.listen(8765, () => {
      console.log("image server → :8765");
      resolve(() => server.close());
    });
    server.on("error", reject);
  });
}

const mode = process.argv[2];
if (!mode || !["ig-container", "fb-unpublished", "ig-publish", "fb-publish"].includes(mode)) {
  console.error("usage: post-test-cli.ts <ig-container|fb-unpublished|ig-publish|fb-publish>");
  process.exit(1);
}
if (!env.http.publicBaseUrl) {
  console.error("PUBLIC_BASE_URL must be set and serving /i/");
  process.exit(1);
}

await initStateStore();
const brand = await getBrand("valdes");
if (!brand) throw new Error("brand valdes not found");

// Start embedded image server BEFORE rendering — same imagesDir(), guaranteed.
const stopServer = await startImageServer();

const TEST_HEADLINE = "62 Yelp reviews. A Yahoo email. One of these wins.";
const TEST_BODY =
  "Looked at a pool company in Henderson last week. 62 Yelp reviews. Their contact email was a Yahoo address. The fix takes 20 minutes and $6 a month. Swap the contact email before you send your next quote.";

const filename = await renderCardToVolume({
  brand,
  template: "statement",
  headline: TEST_HEADLINE,
  size: mode.startsWith("ig") ? "ig" : "fb",
});
const imageUrl = publicImageUrl(env.http.publicBaseUrl, filename);
console.log(`card: ${imageUrl}`);
console.log(`local check: curl -I "http://localhost:8765/i/${filename}"`);

const igConn = brand.accounts.instagram?.composio_connection_id ?? "";
const fbConn = brand.accounts.facebook?.composio_connection_id ?? "";

switch (mode) {
  case "ig-container": {
    // Container creation is the risk concentrate: IG's CDN must fetch the
    // image from PUBLIC_BASE_URL and accept it as JPEG. No publish call.
    let igUserId = getState().igUserId;
    if (!igUserId) {
      const me = await executeTool("INSTAGRAM_GET_USER_INFO", igConn, {});
      console.log("get-user-info:", JSON.stringify(me).slice(0, 300));
      if (!me.successful) process.exit(1);
      const d = (me.data.response_dict ?? me.data) as Record<string, unknown>;
      igUserId = String(d.id ?? d.user_id ?? "");
      await mutateState((s) => {
        s.igUserId = igUserId;
      });
    }
    const container = await executeTool(IG_CONTAINER_TOOL, igConn, {
      ig_user_id: igUserId,
      image_url: imageUrl,
      caption: TEST_BODY,
      content_type: "photo",
    });
    console.log("container result:", JSON.stringify(container).slice(0, 500));
    stopServer();
    process.exit(container.successful ? 0 : 1);
    break;
  }
  case "fb-unpublished": {
    // published:false → page inbox/unpublished posts, nothing public.
    const pages = await executeTool("FACEBOOK_GET_USER_PAGES", fbConn, {});
    console.log("pages:", JSON.stringify(pages).slice(0, 1500));
    const d = (pages.data.response_dict ?? pages.data.response_data ?? pages.data) as Record<string, unknown>;
    const list = (Array.isArray(d.data) ? d.data : []) as Array<{ id?: string; name?: string }>;
    if (!list[0]?.id) {
      console.error("no pages on connection");
      stopServer();
      process.exit(1);
    }
    const result = await executeTool(FB_PHOTO_POST_TOOL, fbConn, {
      page_id: list[0].id,
      url: imageUrl,
      message: `[PIPE TEST — unpublished] ${TEST_BODY}`,
      published: false,
      scheduled_publish_time: Math.floor(Date.now() / 1000) + 6 * 30 * 24 * 3600, // far future
    });
    console.log("fb unpublished result:", JSON.stringify(result).slice(0, 500));
    stopServer();
    process.exit(result.successful ? 0 : 1);
    break;
  }
  case "ig-publish": {
    const r = await postToInstagram({ caption: TEST_BODY, imageUrl, connectedAccountId: igConn });
    console.log("LIVE IG POST:", r.postUrl);
    stopServer();
    break;
  }
  case "fb-publish": {
    const r = await postToFacebook({
      message: TEST_BODY,
      imageUrl,
      connectedAccountId: fbConn,
      configuredPageId: brand.accounts.facebook?.page_id,
    });
    console.log("LIVE FB POST:", r.postUrl);
    stopServer();
    break;
  }
}
