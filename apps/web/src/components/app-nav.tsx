"use client";

import { Books, Broadcast, ChartBar, House, PlusCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { t } from "@/i18n/messages";

const ITEMS = [
  { href: "/app", key: "nav.dashboard", Icon: House, exact: true },
  { href: "/app/new", key: "nav.new", Icon: PlusCircle },
  { href: "/app/library", key: "nav.library", Icon: Books },
  { href: "/app/channels", key: "nav.channels", Icon: Broadcast },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(`${href}/`);
}

// Desktop: inline links in the header.
export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const active = useActive();
  const items = isAdmin ? [...ITEMS, { href: "/admin", key: "nav.admin", Icon: ChartBar }] : ITEMS;
  return (
    <nav aria-label={t("nav.app")} className="hidden flex-1 items-center gap-1 md:flex">
      {items.map(({ href, key, ...rest }) => {
        const on = active(href, "exact" in rest && rest.exact);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={cx("whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors", on ? "bg-line/70 font-semibold" : "hover:bg-line/50")}>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

// Mobile: bottom tab bar (thumb reach, always visible). Rendered outside the header: the header's
// backdrop-filter would otherwise become the containing block of this fixed element.
export function MobileTabBar() {
  const active = useActive();
  return (
    <nav aria-label={t("nav.app")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, key, Icon, ...rest }) => {
          const on = active(href, "exact" in rest && rest.exact);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={cx("grid justify-items-center gap-1 py-2 text-[11px]", on ? "font-semibold text-ink" : "text-muted")}>
                <Icon size={22} weight={on ? "fill" : "regular"} aria-hidden="true" className={on ? "text-ink" : undefined} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
