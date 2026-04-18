import type { Metadata } from "next";
import "./globals.css";

function getMetadataBase(): URL {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";

  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  title: "Parloir",
  description: "A council of AI personas, deliberating in the open.",
  metadataBase: getMetadataBase(),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The [locale] layout sets <html lang> and mounts NextIntlClientProvider.
  // This root layout only exists so Next.js has a layout at the top.
  return children;
}
