import { existsSync } from "node:fs";
import path from "node:path";
import type { BrowserRenderer, BrowserRenderResult } from "./browser-renderer.js";

export interface PlaywrightRendererOptions {
  enabled?: boolean;
  executablePath?: string;
  /** Phase 3 has no approved network-enabled browser provider profile. */
  networkProviderProfile?: never;
}

/**
 * Disabled adapter shell only. Phase 3 deliberately does not depend on
 * playwright-core and never downloads or launches a browser. A later phase
 * must supply a separately approved network profile and reuse the same URL,
 * DNS, redirect, and robots policies before rendering can be implemented.
 */
export class PlaywrightRenderer implements BrowserRenderer {
  readonly enabled: boolean;
  readonly #options: PlaywrightRendererOptions;

  constructor(options: PlaywrightRendererOptions = {}) {
    this.enabled = options.enabled === true;
    this.#options = options;
  }

  async render(): Promise<BrowserRenderResult> {
    if (!this.enabled) return { status: "unavailable", reason: "disabled" };
    if (!this.#options.executablePath || !path.isAbsolute(this.#options.executablePath)) {
      return { status: "unavailable", reason: "executable_not_configured" };
    }
    if (!existsSync(this.#options.executablePath)) {
      return { status: "unavailable", reason: "executable_unavailable" };
    }
    return { status: "unavailable", reason: "network_profile_unavailable" };
  }
}
