"use client";

import { UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/cn";
import { LanguageToggle } from "./language-toggle";
import { NAV_ITEMS } from "./nav-items";
import { TextSizeControl } from "./text-size-control";

/**
 * Mobile: top header + tricolour strip + bottom navigation (matches the hi-fi screens).
 * Desktop (lg+): left navigation rail; pages may render a two-pane layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const darkHeader = pathname === "/";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-ink"
      >
        {t("app.skip")}
      </a>

      {/* Desktop rail */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-line lg:bg-surface">
        <div className="px-5 pt-6 pb-4">
          <Link href="/" aria-label={t("app.name")}>
            <Image src="/brand/wordmark.webp" alt={t("app.name")} width={192} height={34} priority />
          </Link>
          <p className="mt-2 text-xs text-muted">{t("app.tagline")}</p>
        </div>
        <div className="tricolour" aria-hidden />
        <nav aria-label={t("nav.main")} className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold",
                      active ? "bg-primary text-white" : "text-ink hover:bg-surface-2",
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                    {t(label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <Link
            href="/profile"
            aria-current={pathname.startsWith("/profile") ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold",
              pathname.startsWith("/profile") ? "bg-primary text-white" : "text-ink hover:bg-surface-2",
            )}
          >
            <UserRound aria-hidden className="size-5" />
            {t("nav.profile")}
          </Link>
          <LanguageToggle />
          <TextSizeControl />
          <p className="text-xs leading-snug text-muted">{t("app.limits")}</p>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Mobile header */}
        <header
          className={cn(
            "sticky top-0 z-30 lg:hidden",
            darkHeader ? "bg-primary-deep text-white" : "bg-surface/95 backdrop-blur",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <Link href="/" aria-label={t("app.name")} className="flex shrink-0 items-center gap-2">
              <Image src="/brand/mark.png" alt="" width={30} height={30} priority />
              <span
                className={cn(
                  "hidden text-lg font-extrabold tracking-tight min-[400px]:inline",
                  darkHeader ? "text-white" : "text-primary",
                )}
              >
                GovNav<span className="text-gold">AI</span>
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <TextSizeControl compact tone={darkHeader ? "dark" : "light"} />
              <LanguageToggle tone={darkHeader ? "dark" : "light"} />
              <Link
                href="/profile"
                aria-label={t("nav.profile")}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  darkHeader ? "text-white ring-1 ring-white/25 hover:bg-white/10" : "text-primary ring-1 ring-line hover:bg-surface-2",
                )}
              >
                <UserRound aria-hidden className="size-5" />
              </Link>
            </div>
          </div>
          <div className="tricolour" aria-hidden />
        </header>

        <main id="main" className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav
          aria-label={t("nav.main")}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <ul className="grid grid-cols-4">
            {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-semibold leading-tight",
                      active ? "text-primary" : "text-muted",
                    )}
                  >
                    <span className={cn("rounded-full px-4 py-1", active && "bg-primary/10")}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    {t(label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
