"use client";

import { useRouter } from "next/navigation";
import { FileVideo, UploadSimple } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { StylePicker, type SubtitleStyle } from "@/components/style-picker";
import { buttonClass, cx, inputClass } from "@/components/ui";
import { t } from "@/i18n/messages";
import {
  forgetUpload,
  pendingUploadFor,
  rememberUpload,
  uploadParts,
  type UploadPlan,
} from "@/lib/upload-client";

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska";
type Mode = "file" | "link";

const formatSize = (bytes: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(bytes / 1024 ** (bytes >= 1024 ** 3 ? 3 : 2)) +
  (bytes >= 1024 ** 3 ? "\u00a0Go" : "\u00a0Mo");

async function errorCode(res: Response) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error;
}

export function UploadForm(props: { initialMode?: Mode; defaultStyle?: SubtitleStyle; defaultWithHook?: boolean }) {
  const router = useRouter();
  const ids = { file: useId(), help: useId(), link: useId(), linkHelp: useId(), hook: useId(), rights: useId() };
  const [mode, setMode] = useState<Mode>(props.initialMode ?? "file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [style, setStyle] = useState<SubtitleStyle>(props.defaultStyle ?? "impact");
  const [withHook, setWithHook] = useState(props.defaultWithHook ?? true);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
    cx("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink");

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div role="tablist" aria-label={t("upload.heading")} className="inline-flex justify-self-start rounded-full bg-line/60 p-1">
        <button type="button" role="tab" aria-selected={mode === "file"} className={tab("file")} onClick={() => setMode("file")} disabled={busy}>
          {t("new.tab.file")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "link"} className={tab("link")} onClick={() => setMode("link")} disabled={busy}>
          {t("new.tab.link")}
        </button>
      </div>

      {mode === "file" ? (
        <div className="grid gap-2">
          <span className="text-sm font-medium" id={`${ids.file}-label`}>{t("upload.file")}</span>
          <label htmlFor={ids.file}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pick(e.dataTransfer.files?.[0]); }}
            className={cx(
              "grid cursor-pointer justify-items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
              dragging ? "border-gold bg-gold-soft/50" : file ? "border-control bg-surface" : "border-control hover:border-ink",
              busy && "cursor-not-allowed opacity-70",
            )}>
            {file ? <FileVideo size={32} aria-hidden="true" /> : <UploadSimple size={32} aria-hidden="true" />}
            {file ? (
              <span className="grid gap-1">
                <span className="break-all font-medium">{file.name}</span>
                <span className="text-sm text-muted">{formatSize(file.size)} · {t("upload.change")}</span>
              </span>
            ) : (
              <span className="grid gap-1">
                <span className="font-medium">{t("upload.drop")}</span>
                <span className="text-sm text-muted">{t("upload.browse")}</span>
              </span>
            )}
            <input ref={fileInput} id={ids.file} type="file" accept={ACCEPT} aria-labelledby={`${ids.file}-label`}
              aria-describedby={ids.help} required disabled={busy} className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <p id={ids.help} className="text-sm text-muted">{t("upload.fileHelp")}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <label htmlFor={ids.link} className="text-sm font-medium">{t("new.link")}</label>
          <input id={ids.link} type="url" inputMode="url" required disabled={busy} value={link}
            onChange={(e) => setLink(e.target.value)} aria-describedby={ids.linkHelp}
            placeholder="https://drive.google.com/…" autoComplete="off" spellCheck={false} autoCapitalize="none" className={inputClass} />
          <p id={ids.linkHelp} className="text-sm text-muted">{t("new.linkHelp")}</p>
          {/youtu/.test(link) && <p className="text-sm text-muted">{t("new.youtubeNote")}</p>}
        </div>
      )}

      <StylePicker legend={t("upload.style")} name="style" value={style} onChange={setStyle} disabled={busy} />

      <label htmlFor={ids.hook} className="flex items-center gap-3 text-sm">
        <input id={ids.hook} type="checkbox" checked={withHook} disabled={busy}
          onChange={(e) => setWithHook(e.target.checked)} className="size-4 accent-gold" />
        {t("upload.hook")}
      </label>

      <label htmlFor={ids.rights} className="flex items-start gap-3 text-sm">
        <input id={ids.rights} type="checkbox" checked={rights} required disabled={busy}
          onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-4 accent-gold" />
        {t("upload.rights")}
      </label>

      {busy && mode === "file" && (
        <div className="grid gap-2" aria-live="polite">
          <span className="text-sm">
            {resuming ? t("upload.resuming") : t("upload.uploading")} : {Math.round((progress ?? 0) * 100)} %
          </span>
          <progress max={1} value={progress ?? 0} className="h-2 w-full accent-gold" />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={!ready || busy}
        className={buttonClass("primary", "lg") + " justify-self-start"}>
        {busy ? `${t("upload.submit")}…` : t("upload.submit")}
      </button>
    </form>
  );
}
