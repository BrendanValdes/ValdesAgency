import type { FetchFailure, FetchSuccess } from "../types.js";

export type BrowserRenderResult =
  | { status: "rendered"; page: FetchSuccess }
  | {
      status: "unavailable";
      reason:
        | "disabled"
        | "executable_not_configured"
        | "executable_unavailable"
        | "network_profile_unavailable";
    }
  | { status: "failed"; failure: FetchFailure };

export interface BrowserRenderer {
  readonly enabled: boolean;
  render(input: { url: string; signal?: AbortSignal }): Promise<BrowserRenderResult>;
}

export class DisabledBrowserRenderer implements BrowserRenderer {
  readonly enabled = false;

  async render(): Promise<BrowserRenderResult> {
    return { status: "unavailable", reason: "disabled" };
  }
}
