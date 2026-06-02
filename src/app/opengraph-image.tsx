import { ImageResponse } from "next/og";
import { Base2SolOgImage, ogSize } from "@/components/brand/OgImage";

export const runtime = "edge";
export const alt = "base2sol - register Base tokens on Solana and bridge both ways";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <Base2SolOgImage
        eyebrow="Base x Solana"
        title="base2sol"
        subtitle="Register Base tokens on Solana, then bridge both ways from one non-custodial interface."
      />
    ),
    ogSize
  );
}
