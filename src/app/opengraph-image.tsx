import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Parloir — a council of AI personas, deliberating in the open.";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0d10",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px",
          color: "#ede8df",
          fontFamily: "serif",
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 32 32"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: "40px" }}
        >
          <path
            d="M10 7 L6 7 L6 25 L10 25"
            stroke="#ede8df"
            strokeWidth="1.75"
          />
          <path
            d="M22 7 L26 7 L26 25 L22 25"
            stroke="#ede8df"
            strokeWidth="1.75"
          />
          <path
            d="M13 11 L19 16 L13 21"
            stroke="#e8b464"
            strokeWidth="2"
          />
        </svg>
        <div
          style={{
            fontSize: 120,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            marginBottom: 28,
          }}
        >
          Parloir
        </div>
        <div
          style={{
            fontSize: 32,
            color: "rgba(237, 232, 223, 0.55)",
            letterSpacing: "0.01em",
            fontFamily: "sans-serif",
            textAlign: "center",
            maxWidth: 820,
            lineHeight: 1.3,
          }}
        >
          A council of AI personas, deliberating in the open.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 56,
            fontSize: 20,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#e8b464",
            fontFamily: "monospace",
          }}
        >
          parloir.dev
        </div>
      </div>
    ),
    { ...size },
  );
}
