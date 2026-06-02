/**
 * Bigint-safe JSON.
 *
 * The SDK uses native `bigint` for amounts and some message fields. JSON has no
 * bigint, so we tag them on the wire as { $bigint: "123" } and restore on parse.
 * Both the API routes and the browser client use these helpers so a value can
 * round-trip (transfer -> messageRef -> prove/execute) without precision loss.
 */

const TAG = "$bigint";

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { [TAG]: value.toString() };
  if (value instanceof Uint8Array) return { $u8: Array.from(value) };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj[TAG] === "string") return BigInt(obj[TAG] as string);
    if (Array.isArray(obj.$u8)) return new Uint8Array(obj.$u8 as number[]);
  }
  return value;
}

export function encode(value: unknown): string {
  return JSON.stringify(value, replacer);
}

export function decode<T = unknown>(text: string): T {
  return JSON.parse(text, reviver) as T;
}

/** Deep clone through the tagged form (used to hand SDK objects to fetch). */
export function toWire<T>(value: T): T {
  return decode<T>(encode(value));
}
