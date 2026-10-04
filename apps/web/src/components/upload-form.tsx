"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { t } from "@/i18n/messages";
import {
  forgetUpload,
  pendingUploadFor,
  rememberUpload,
  uploadParts,
  type UploadPlan,
} from "@/lib/upload-client";

const STYLES = ["impact", "boite", "epure"] as const;
type Mode = "file" | "link";

const field = "rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

async function errorCode(res: Response) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error;
}

export function UploadForm() {
  const router = useRouter();
  const ids = { file: useId(), help: useId(), link: useId(), linkHelp: useId(), style: useId(), hook: useId(), rights: useId() };
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("impact");
  const [withHook, setWithHook] = useState(true);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (code?: string) => {
    setProgress(null);
    setResuming(false);
    setError(code && code !== "invalid_request" ? t(`upload.error.${code}`) : t("upload.error"));
  };

  async function startOrResume(f: File): Promise<UploadPlan | null> {
    const pending = pendingUploadFor(f);
    if (pending) {
      const res = await fetch(`/api/uploads/${pending}/parts`);
      if (res.ok) {
        setResuming(true);
        return (await res.json()) as UploadPlan;
      }
      forgetUpload(f);
    }
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: f.name,
        size: f.size,
        contentType: f.type || "video/mp4",
        style,
        withHook,
        rightsCertified: true,
      }),
    });
    if (!res.ok) {
      fail(await errorCode(res));
      return null;
    }
    const plan = (await res.json()) as UploadPlan;
    rememberUpload(f, plan.jobId);
    return plan;
  }

  async function submitFile() {
    if (!file) return;
    setProgress(0);
    const plan = await startOrResume(file);
    if (!plan) return;
    const parts = await uploadParts(file, plan, setProgress);
    const done = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: plan.jobId, parts }),
    });
    if (!done.ok) return fail(await errorCode(done));
    forgetUpload(file);
    router.push(`/app/jobs/${plan.jobId}`);
  }

  async function submitLink() {
    setProgress(0);
    const res = await fetch("/api/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: link, style, withHook, rightsCertified: true }),
    });
    if (!res.ok) return fail(await errorCode(res));
    const { jobId } = (await res.json()) as { jobId: string };
    router.push(`/app/jobs/${jobId}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rights) return;
    setError(null);
    try {
      await (mode === "file" ? submitFile() : submitLink());
    } catch {
      fail(); // network error: selecting the same file again resumes the upload
    }
  }

  const busy = progress !== null;
  const ready = rights && (mode === "file" ? Boolean(file) : link.trim().length > 8);
  const tab = (m: Mode) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-600 dark:text-zinc-400"}`;

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div role="tablist" aria-label={t("upload.heading")} className="inline-flex justify-self-start rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-900">
        <button type="button" role="tab" aria-selected={mode === "file"} className={tab("file")} onClick={() => setMode("file")} disabled={busy}>
          {t("new.tab.file")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "link"} className={tab("link")} onClick={() => setMode("link")} disabled={busy}>
          {t("new.tab.link")}
        </button>
      </div>

      {mode === "file" ? (
        <div className="grid gap-2">
          <label htmlFor={ids.file} className="text-sm font-medium">{t("upload.file")}</label>
          <input id={ids.file} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            aria-describedby={ids.help} required disabled={busy} className={`block w-full ${field}`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p id={ids.help} className="text-sm text-zinc-600 dark:text-zinc-400">{t("upload.fileHelp")}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <label htmlFor={ids.link} className="text-sm font-medium">{t("new.link")}</label>
          <input id={ids.link} type="url" inputMode="url" required disabled={busy} value={link}
            onChange={(e) => setLink(e.target.value)} aria-describedby={ids.linkHelp}
            placeholder="https://" className={field} />
          <p id={ids.linkHelp} className="text-sm text-zinc-600 dark:text-zinc-400">{t("new.linkHelp")}</p>
          {/youtu/.test(link) && <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("new.youtubeNote")}</p>}
        </div>
      )}

      <div className="grid gap-2">
        <label htmlFor={ids.style} className="text-sm font-medium">{t("upload.style")}</label>
        <select id={ids.style} value={style} disabled={busy} className={field}
          onChange={(e) => setStyle(e.target.value as (typeof STYLES)[number])}>
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

      {busy && mode === "file" && (
        <div className="grid gap-2" aria-live="polite">
          <span className="text-sm">
            {resuming ? t("upload.resuming") : t("upload.uploading")} : {Math.round((progress ?? 0) * 100)} %
          </span>
          <progress max={1} value={progress ?? 0} className="h-2 w-full accent-emerald-600" />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={!ready || busy}
        className="justify-self-start rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
        {t("upload.submit")}
      </button>
    </form>
  );
}
