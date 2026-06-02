import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0000ff, #9945ff 52%, #14f195)",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 62,
          fontWeight: 900,
        }}
      >
        b2s
      </div>
    ),
    size
  );
}
