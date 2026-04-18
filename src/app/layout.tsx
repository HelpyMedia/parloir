import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parloir",
  description: "A council of AI personas, deliberating in the open.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The [locale] layout sets <html lang> and mounts NextIntlClientProvider.
  // This root layout only exists so Next.js has a layout at the top.
  return children;
}
