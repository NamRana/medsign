import { ImageResponse } from "next/og";

export const alt = "MedSign — clear health context before your clinician visit";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "linear-gradient(135deg, #052e2b 0%, #0f766e 52%, #0e7490 100%)",
          color: "#f0fdfa",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          overflow: "hidden",
          padding: "72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(153, 246, 228, 0.55)",
            borderRadius: "999px",
            color: "#99f6e4",
            display: "flex",
            fontSize: 25,
            letterSpacing: "0.16em",
            padding: "12px 22px",
            textTransform: "uppercase",
            width: "fit-content",
          }}
        >
          AI-generated health information
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "920px" }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 700, letterSpacing: "-0.04em" }}>
            MedSign
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: "-0.055em",
              lineHeight: 1.03,
              marginTop: "24px",
            }}
          >
            Make your next health conversation clearer.
          </div>
        </div>
        <div style={{ color: "#ccfbf1", display: "flex", fontSize: 28, lineHeight: 1.35 }}>
          Understand lab reports, symptoms, and medication context before a clinician visit.
        </div>
        <div
          style={{
            background: "rgba(94, 234, 212, 0.18)",
            borderRadius: "999px",
            height: "420px",
            position: "absolute",
            right: "-145px",
            top: "-125px",
            width: "420px",
          }}
        />
      </div>
    ),
    size
  );
}
