import { describe, expect, it } from "vitest";
import {
  addMicroUsd,
  formatMicroUsd,
  microUsd,
  microUsdFromUsd,
  subtractMicroUsd,
} from "../../src/lead-engine/domain/money.js";

describe("integer micro-USD", () => {
  it("adds decimal-denominated costs without floating-point drift", () => {
    const tenCents = microUsdFromUsd("0.1");
    const twentyCents = microUsdFromUsd("0.2");
    expect(addMicroUsd(tenCents, twentyCents)).toBe(300_000);
    expect(formatMicroUsd(addMicroUsd(tenCents, twentyCents))).toBe("0.3");
  });

  it("supports exact subtraction and rejects unsafe values", () => {
    expect(subtractMicroUsd(microUsd(10), microUsd(3))).toBe(7);
    expect(() => microUsd(0.5)).toThrow("safe integer");
    expect(() => microUsd(Number.MAX_SAFE_INTEGER + 1)).toThrow("safe integer");
    expect(() => microUsdFromUsd("1.0000001")).toThrow("at most six places");
    expect(() => subtractMicroUsd(microUsd(3), microUsd(4))).toThrow("negative");
  });
});
