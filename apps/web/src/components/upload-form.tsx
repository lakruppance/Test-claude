"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { t } from "@/i18n/messages";
import { uploadParts, type UploadStart } from "@/lib/upload-client";

const STYLES = ["impact", "boite", "epure"] as const;

export function UploadForm() {
  const router = useRouter();
  const ids = { file: useId(), help: useId(), style: useId(), hook: useId(), rights: useId() };
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("impact");
  const [withHook, setWithHook] = useState(true);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !rights) return;
    setError(null);
    setProgress(0);
    try {
      const startRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          contentType: file.type || "video/mp4",
          style,
          withHook,
          rightsCertified: true,
        }),
      });
      if (!startRes.ok) {
        const code = (await startRes.json().catch(() => ({}))).error as string | undefined;
        setProgress(null);
        return setError(code && code !== "invalid_request" ? t(`upload.error.${code}`) : t("upload.error"));
      }
      const start = (await startRes.json()) as UploadStart;
      const parts = await uploadParts(file, start, setProgress);
      const done = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: start.jobId, parts }),
      });
      if (!done.ok) throw new Error("upload_complete_failed");
      router.push(`/app/jobs/${start.jobId}`);
    } catch {
      setError(t("upload.error"));
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-2">
        <label htmlFor={ids.file} className="text-sm font-medium">{t("upload.file")}</label>
        <input
          id={ids.file}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          aria-describedby={ids.help}
          required
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p id={ids.help} className="text-sm text-zinc-600 dark:text-zinc-400">{t("upload.fileHelp")}</p>
      </div>

      <div className="grid gap-2">
        <label htmlFor={ids.style} className="text-sm font-medium">{t("upload.style")}</label>
        <select
          id={ids.style}
          value={style}
          disabled={busy}
          onChange={(e) => setStyle(e.target.value as (typeof STYLES)[number])}
          className="rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {STYLES.map((s) => (
            <option key={s} value={s}>{t(`upload.style.${s}`)}</option>
          ))}
        </select>
      </div>

      <label htmlFor={ids.hook} className="flex items-center gap-3 text-sm">
        <input id={ids.hook} type="checkbox" checked={withHook} disabled={busy}
          onChange={(e) => setWithHook(e.target.checked)} className="size-4 accent-emerald-600" />
        {t("upload.hook")}
      </label>

      <label htmlFor={ids.rights} className="flex items-start gap-3 text-sm">
        <input id={ids.rights} type="checkbox" checked={rights} required disabled={busy}
          onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-4 accent-emerald-600" />
        {t("upload.rights")}
      </label>

      {busy && (
        <div className="grid gap-2" aria-live="polite">
          <span className="text-sm">{t("upload.uploading")} : {Math.round((progress ?? 0) * 100)} %</span>
          <progress max={1} value={progress ?? 0} className="h-2 w-full accent-emerald-600" />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!file || !rights || busy}
        className="justify-self-start rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("upload.submit")}
      </button>
    </form>
  );
}
