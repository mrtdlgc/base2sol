export const SITE_NAME = "base2sol";

export const SITE_DESCRIPTION =
  "Register Base tokens on Solana, then bridge between Base and Solana from one non-custodial interface.";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://base2sol.xyz"
).replace(/\/$/, "");

export const REPOSITORY_URL = (
  process.env.NEXT_PUBLIC_REPOSITORY_URL || ""
).replace(/\/$/, "");

export const KNOWN_PAIR_REQUEST_URL = REPOSITORY_URL
  ? `${REPOSITORY_URL}/issues/new?template=known-pair.yml`
  : "";

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
