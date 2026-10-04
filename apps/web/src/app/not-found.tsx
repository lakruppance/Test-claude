import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui";
import { StateMessage } from "@/components/state-pages";
import { t } from "@/i18n/messages";

export default function NotFound() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-8">
      <Link href="/" aria-label={t("nav.home")} className="justify-self-start"><Logo /></Link>
      <main id="contenu">
        <StateMessage
          title={t("state.notFound.title")}
          lead={t("state.notFound.lead")}
          action={<ButtonLink href="/app">{t("nav.dashboard")}</ButtonLink>}
        />
      </main>
    </div>
  );
}
