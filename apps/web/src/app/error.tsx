"use client";

import { useEffect } from "react";
import { RetryButton, StateMessage } from "@/components/state-pages";
import { t } from "@/i18n/messages";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main id="contenu" className="mx-auto w-full max-w-7xl px-4 md:px-8">
      <StateMessage title={t("state.error.title")} lead={t("state.error.lead")} action={<RetryButton onRetry={retry} />} />
    </main>
  );
}
