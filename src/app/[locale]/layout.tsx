import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/server";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { routing } from "@/i18n/routing";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [user, messages] = await Promise.all([
    getCurrentUser(),
    getMessages(),
  ]);
  const navUser = user
    ? { id: user.id, email: user.email, name: user.name ?? null }
    : null;

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <GlobalNav user={navUser} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
