import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  const account = await getAccount(user.id);
  const link = "rounded-full px-3 py-2 text-sm whitespace-nowrap hover:bg-line/50";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link href="/app" aria-label={t("nav.dashboard")} className="shrink-0"><Logo /></Link>
          <nav aria-label="Application" className="-mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2">
            <Link href="/app" className={link}>{t("nav.dashboard")}</Link>
            <Link href="/app/new" className={link}>{t("nav.new")}</Link>
            <Link href="/app/library" className={link}>{t("nav.library")}</Link>
            <Link href="/app/channels" className={link}>{t("nav.channels")}</Link>
            {account.isAdmin && <Link href="/admin" className={link}>{t("nav.admin")}</Link>}
          </nav>
          <Link href="/app/account" className={`${link} inline-flex shrink-0 items-center gap-2`} aria-label={t("nav.account")}>
            <UserCircle size={22} aria-hidden="true" />
            <span className="hidden max-w-48 truncate md:inline">{account.displayName || account.email}</span>
          </Link>
        </div>
      </header>
      <main id="contenu" className="scroll-mt-20 mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-8">{children}</main>
    </div>
  );
}
