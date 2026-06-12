// Gate 6 branded template cards — satori → resvg → JPEG.
// ============================================================================
// $0-per-image card renderer for IG/FB posts. Three layouts keyed by day
// theme, every color and font read from brand.visual at render time — no
// hardcoded hex. JPEG output is mandatory: Instagram's media-container
// endpoint rejects PNG image_urls. jpeg-js is pure JS; flat-color cards
// compress to well under IG's 8MB cap at quality 90.
//
// satori is fed plain object element trees (no React). satori rule: any div
// with multiple children must declare display:flex.
//
// The brand chip is typeset text (display_name in Syne + gold rule) — the
// yaml logo files are PENDING upload and nothing here may depend on them.
// ============================================================================

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import satori from "satori";
import { log } from "../logger.js";
import { type BrandConfig, resolveDataDir } from "./brand-config.js";
import { resolveStateDir } from "./state.js";

export type CardTemplate = "framework" | "statement" | "roundup";
export type CardSize = "ig" | "fb";

const SIZES: Record<CardSize, { width: number; height: number }> = {
  ig: { width: 1080, height: 1080 }, // IG feed 1:1
  fb: { width: 1200, height: 630 }, // FB link/photo 1.91:1
};

const DEFAULT_KICKERS: Record<CardTemplate, string> = {
  framework: "THE FRAMEWORK",
  statement: "FIELD NOTE",
  roundup: "THIS WEEK",
};

// Satori element tree node — minimal shape, no React.
type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: Node[] | string };
};

let fontsPromise: Promise<
  Array<{ name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" }>
> | null = null;

function loadFonts() {
  fontsPromise ??= (async () => {
    const dir = resolveDataDir("assets/fonts");
    const load = (file: string) => readFile(join(dir, file));
    const [fraunces, interRegular, interMedium, syne] = await Promise.all([
      load("Fraunces-Bold.ttf"),
      load("Inter-Regular.ttf"),
      load("Inter-Medium.ttf"),
      load("Syne-Bold.ttf"),
    ]);
    return [
      { name: "Fraunces", data: fraunces, weight: 700 as const, style: "normal" as const },
      { name: "Inter", data: interRegular, weight: 400 as const, style: "normal" as const },
      { name: "Inter", data: interMedium, weight: 500 as const, style: "normal" as const },
      { name: "Syne", data: syne, weight: 700 as const, style: "normal" as const },
    ];
  })();
  return fontsPromise;
}

/** Adaptive headline size: short lines go big, long lines stay readable. */
function headlineFontSize(headline: string, size: CardSize): number {
  const base = headline.length <= 38 ? 84 : headline.length <= 64 ? 68 : 56;
  // FB canvas is shorter — scale down proportionally to its height.
  return size === "fb" ? Math.round(base * 0.78) : base;
}

function chip(brand: BrandConfig, color: string): Node {
  const p = brand.visual.palette;
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", gap: 14 },
      children: [
        {
          type: "div",
          props: { style: { width: 64, height: 5, backgroundColor: p.secondary } },
        },
        {
          type: "div",
          props: {
            style: {
              fontFamily: "Syne",
              fontSize: 26,
              letterSpacing: 6,
              color,
            },
            children: brand.display_name.toUpperCase(),
          },
        },
      ],
    },
  };
}

function kickerNode(text: string, color: string): Node {
  return {
    type: "div",
    props: {
      style: {
        fontFamily: "Syne",
        fontSize: 30,
        letterSpacing: 8,
        color,
      },
      children: text.toUpperCase(),
    },
  };
}

function headlineNode(text: string, color: string, fontSize: number): Node {
  return {
    type: "div",
    props: {
      style: {
        fontFamily: "Fraunces",
        fontSize,
        lineHeight: 1.12,
        color,
      },
      children: text,
    },
  };
}

function frame(size: CardSize, bg: string, children: Node[]): Node {
  const { width, height } = SIZES[size];
  return {
    type: "div",
    props: {
      style: {
        width,
        height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: bg,
        padding: size === "fb" ? 64 : 88,
      },
      children,
    },
  };
}

function buildTree(
  brand: BrandConfig,
  template: CardTemplate,
  headline: string,
  kicker: string,
  size: CardSize,
): Node {
  const p = brand.visual.palette;
  const fontSize = headlineFontSize(headline, size);

  switch (template) {
    case "framework":
      // Maroon authority card: gold kicker, white Fraunces headline.
      return frame(size, p.accent, [
        kickerNode(kicker, p.secondary),
        headlineNode(headline, p.primary, fontSize),
        chip(brand, p.primary),
      ]);

    case "statement":
      // Soft-cream field note: gold kicker, dark headline over a gold rule.
      return frame(size, p.neutral_soft, [
        kickerNode(kicker, p.secondary),
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 36 },
            children: [
              {
                type: "div",
                props: { style: { width: 120, height: 6, backgroundColor: p.secondary } },
              },
              headlineNode(headline, p.neutral_dark, fontSize),
            ],
          },
        },
        chip(brand, p.neutral_dark),
      ]);

    case "roundup":
      // White card with an oversized gold glyph anchoring the corner.
      return frame(size, p.primary, [
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
            children: [
              kickerNode(kicker, p.accent),
              {
                type: "div",
                props: {
                  style: {
                    fontFamily: "Fraunces",
                    fontSize: size === "fb" ? 160 : 220,
                    lineHeight: 0.7,
                    color: p.secondary,
                  },
                  children: "*",
                },
              },
            ],
          },
        },
        headlineNode(headline, p.neutral_dark, fontSize),
        chip(brand, p.accent),
      ]);
  }
}

export type RenderCardOpts = {
  brand: BrandConfig;
  template: CardTemplate;
  headline: string;
  kicker?: string;
  size: CardSize;
};

/** Render a card to a JPEG buffer. Pure function of its inputs. */
export async function renderCard(opts: RenderCardOpts): Promise<Buffer> {
  const { width, height } = SIZES[opts.size];
  const fonts = await loadFonts();
  const tree = buildTree(
    opts.brand,
    opts.template,
    opts.headline,
    opts.kicker ?? DEFAULT_KICKERS[opts.template],
    opts.size,
  );

  // satori's types want React elements; the object-tree form is supported.
  const svg = await satori(tree as never, { width, height, fonts });
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render();
  const rgba = rendered.pixels;

  // resvg yields RGBA; jpeg-js expects RGBA too (alpha dropped on encode).
  const encoded = jpeg.encode(
    { data: rgba, width: rendered.width, height: rendered.height },
    90,
  );
  return encoded.data;
}

// ---------------------------------------------------------------------------
// Volume storage — STATE_DIR/images, served publicly by health.ts as
// /i/<token>.jpg. The random filename IS the unguessable access token.
// ---------------------------------------------------------------------------

export function imagesDir(): string {
  return join(resolveStateDir(), "images");
}

export function newImageFilename(): string {
  return `${randomBytes(16).toString("base64url")}.jpg`;
}

/** Render and persist a card; returns the token filename for QueueEntry.imageFile. */
export async function renderCardToVolume(opts: RenderCardOpts): Promise<string> {
  const buf = await renderCard(opts);
  const dir = imagesDir();
  await mkdir(dir, { recursive: true });
  const filename = newImageFilename();
  await writeFile(join(dir, filename), buf);
  log.info("card_rendered", {
    template: opts.template,
    size: opts.size,
    bytes: buf.length,
    file: filename,
  });
  return filename;
}

/** Public URL for a stored card — requires PUBLIC_BASE_URL (checked by self-check). */
export function publicImageUrl(baseUrl: string, filename: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/i/${filename}`;
}
