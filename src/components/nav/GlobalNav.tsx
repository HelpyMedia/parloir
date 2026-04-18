"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { SignOutButton } from "./SignOutButton";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface NavUser {
  id: string;
  email: string;
  name?: string | null;
}

const HIDE_PATHS = [/^\/signin(\/.*)?$/, /^\/signup(\/.*)?$/];

export function GlobalNav({ user }: { user: NavUser | null }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  if (HIDE_PATHS.some((r) => r.test(pathname))) return null;

  const links = user
    ? ([
        { href: "/sessions", label: t("sessions") },
        { href: "/sessions/new", label: t("newSession") },
        { href: "/settings", label: t("settings") },
      ] as const)
    : [];

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-display text-lg tracking-tight text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-spot-warm)]"
        >
          <svg
            viewBox="0 0 32 32"
            aria-hidden="true"
            className="h-5 w-5 shrink-0"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M10 7 L6 7 L6 25 L10 25"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M22 7 L26 7 L26 25 L22 25"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M13 11 L19 16 L13 21"
              stroke="var(--color-spot-warm)"
              strokeWidth="2"
            />
          </svg>
          {t("brand")}
        </Link>

        {user ? (
          <nav className="flex items-center gap-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "font-mono text-[11px] uppercase tracking-[0.18em] transition-colors " +
                  (isActive(l.href)
                    ? "text-[var(--color-spot-warm)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")
                }
              >
                {l.label}
              </Link>
            ))}
            <span className="hidden font-mono text-[11px] text-[var(--color-text-dim)] md:inline">
              {user.email}
            </span>
            <SignOutButton />
            <LanguageSwitcher />
          </nav>
        ) : (
          <nav className="flex items-center gap-4">
            <Link
              href="/signin"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              {t("signIn")}
            </Link>
            <Link
              href="/signup"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-spot-warm)] hover:underline"
            >
              {t("signUp")}
            </Link>
            <LanguageSwitcher />
          </nav>
        )}
      </div>
    </header>
  );
}
