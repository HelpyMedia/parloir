"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

interface NavUser {
  id: string;
  email: string;
  name?: string | null;
}

const HIDE_PATHS = [/^\/signin(\/.*)?$/, /^\/signup(\/.*)?$/];

const LINKS = [
  { href: "/", label: "Sessions" },
  { href: "/sessions/new", label: "New session" },
  { href: "/settings", label: "Settings" },
];

export function GlobalNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  if (HIDE_PATHS.some((r) => r.test(pathname))) return null;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <Link
          href="/"
          className="font-display text-lg tracking-tight text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-spot-warm)]"
        >
          Parloir
        </Link>

        {user ? (
          <nav className="flex items-center gap-6">
            {LINKS.map((l) => (
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
          </nav>
        ) : (
          <nav className="flex items-center gap-4">
            <Link
              href="/signin"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-spot-warm)] hover:underline"
            >
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
