import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0d10",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="130"
          height="130"
          viewBox="0 0 32 32"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
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
      </div>
    ),
    { ...size },
  );
}
