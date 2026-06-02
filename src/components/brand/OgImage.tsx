export const ogSize = {
  width: 1200,
  height: 630,
};

export function Base2SolOgImage({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, #070815 0%, #171125 48%, #081a16 100%)",
        color: "#f8fbff",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(120deg, rgba(0, 0, 255, 0.44), rgba(0, 0, 255, 0.06) 36%, transparent 58%), linear-gradient(305deg, rgba(20, 241, 149, 0.28), rgba(153, 69, 255, 0.28) 42%, transparent 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 12,
          background: "linear-gradient(90deg, #0000ff, #9945ff, #00c2ff, #14f195)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -60,
          top: -90,
          width: 360,
          height: 420,
          transform: "rotate(24deg)",
          border: "2px solid rgba(20, 241, 149, 0.32)",
          borderLeft: "18px solid #0000ff",
          background: "linear-gradient(135deg, rgba(153, 69, 255, 0.22), rgba(20, 241, 149, 0.12))",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "78px 86px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
            color: "#14f195",
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          <span>{eyebrow}</span>
          <span
            style={{
              width: 88,
              height: 8,
              background: "linear-gradient(90deg, #0000ff, #9945ff, #00c2ff, #14f195)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 118,
            fontWeight: 900,
            lineHeight: 0.92,
          }}
        >
          <span>{title}</span>
        </div>
        <div
          style={{
            maxWidth: 820,
            marginTop: 30,
            color: "rgba(248, 251, 255, 0.82)",
            fontSize: 36,
            lineHeight: 1.25,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}
