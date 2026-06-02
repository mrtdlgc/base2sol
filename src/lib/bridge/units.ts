/**
 * Human decimal string <-> integer base units. Isomorphic, dependency-free.
 * Explicit on purpose: the resulting base-unit bigint is shown in the UI so the
 * exact integer being signed is never hidden behind a formatter.
 */

export function toBaseUnits(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`Invalid amount: "${human}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals} for this asset)`);
  }
  const paddedFrac = frac.padEnd(decimals, "0");
  const combined = `${whole === "" ? "0" : whole}${paddedFrac}`;
  return BigInt(combined.replace(/^0+(?=\d)/, ""));
}

export function fromBaseUnits(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
