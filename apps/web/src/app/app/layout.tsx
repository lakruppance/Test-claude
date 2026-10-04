import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav, MobileTabBar } from "@/components/app-nav";
import { Logo } from "@/components/brand/logo";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  const account = await getAccount(user.id);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link href="/app" aria-label={t("nav.dashboard")} className="shrink-0"><Logo /></Link>
          <AppNav isAdmin={account.isAdmin} />
          <Link href="/app/account" className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-line/50">
            <UserCircle size={22} aria-hidden="true" />
            <span className="sr-only md:not-sr-only md:max-w-48 md:truncate">{account.displayName || account.email}</span>
            <span className="sr-only">, {t("nav.account")}</span>
          </Link>
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-7xl flex-1 scroll-mt-20 px-4 pb-28 pt-10 md:px-8 md:pb-10">{children}</main>
      <MobileTabBar />
    </div>
  );
}
