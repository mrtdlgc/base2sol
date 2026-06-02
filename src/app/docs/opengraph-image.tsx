import { ImageResponse } from "next/og";
import { Base2SolOgImage, ogSize } from "@/components/brand/OgImage";

export const runtime = "edge";
export const alt = "base2sol documentation";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <Base2SolOgImage
        eyebrow="Documentation"
        title="base2sol docs"
        subtitle="Guides for token registration, bridging, testnet use, deployment, and operations."
      />
    ),
    ogSize
  );
}
