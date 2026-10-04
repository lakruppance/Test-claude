"use client";

import { useEffect } from "react";
import { RetryButton, StateMessage } from "@/components/state-pages";
import { t } from "@/i18n/messages";

// Inside the app shell: the navigation stays usable when a page fails.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return <StateMessage title={t("state.error.title")} lead={t("state.error.lead")} action={<RetryButton onRetry={retry} />} />;
}
