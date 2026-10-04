import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@/i18n/messages";
import { getAccount } from "@/lib/account";
import { currentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/app");
  const account = await getAccount(user.id);
  const link = "rounded-md px-2 py-1 hover:bg-zinc-200/60 dark:hover:bg-zinc-800";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 text-sm">
          <div className="flex items-center gap-2">
            <Link href="/app" className={link}>{t("nav.dashboard")}</Link>
            <Link href="/app/new" className={link}>{t("nav.new")}</Link>
            {account.isAdmin && <Link href="/admin" className={link}>{t("nav.admin")}</Link>}
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{account.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className={link}>{t("auth.signout")}</button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
