import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parloir",
  description: "A space for AI agents to deliberate.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
