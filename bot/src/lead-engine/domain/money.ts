declare const microUsdBrand: unique symbol;

export type MicroUsd = number & { readonly [microUsdBrand]: "MicroUsd" };

export function microUsd(value: number): MicroUsd {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Micro-USD amount must be a non-negative safe integer");
  }
  return value as MicroUsd;
}

export function microUsdFromUsd(value: string): MicroUsd {
  const match = value.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) {
    throw new Error("USD amount must be a non-negative decimal with at most six places");
  }

  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0"));
  const total = whole * 1_000_000n + fraction;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Micro-USD amount exceeds the safe integer range");
  }
  return microUsd(Number(total));
}

export function addMicroUsd(left: MicroUsd, right: MicroUsd): MicroUsd {
  return microUsd(left + right);
}

export function subtractMicroUsd(left: MicroUsd, right: MicroUsd): MicroUsd {
  if (right > left) {
    throw new Error("Micro-USD subtraction cannot produce a negative amount");
  }
  return microUsd(left - right);
}

export function formatMicroUsd(value: MicroUsd): string {
  const whole = Math.floor(value / 1_000_000);
  const fraction = String(value % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
}
