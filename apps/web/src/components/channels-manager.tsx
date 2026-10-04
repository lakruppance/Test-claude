"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { t } from "@/i18n/messages";

export type ChannelItem = {
  id: string;
  title: string;
  youtube_channel_id: string;
  auto_process: boolean;
  last_checked_at: string | null;
  last_error: string | null;
};

const field = "rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const ghost = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 disabled:opacity-50";

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "default");
  return res.json();
}

export function ChannelsManager(props: {
  channels: ChannelItem[];
  canAdd: boolean;
  canAutoProcess: boolean;
}) {
  const router = useRouter();
  const ids = { input: useId(), help: useId(), rights: useId(), auto: useId() };
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(t(`channels.error.${(e as Error).message}`) === `channels.error.${(e as Error).message}`
        ? t("auth.error.default")
        : t(`channels.error.${(e as Error).message}`));
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const target = e.currentTarget;
    await run("add", async () => {
      await call("/api/channels", {
        method: "POST",
        body: JSON.stringify({
          channel: String(form.get("channel")),
          autoProcess: form.get("auto") === "on",
          rightsCertified: true,
        }),
      });
      target.reset();
    });
  }

  return (
    <div className="grid gap-8">
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      {props.channels.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("channels.empty")}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {props.channels.map((c) => (
            <li key={c.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-1">
                <a href={`https://www.youtube.com/channel/${c.youtube_channel_id}`} target="_blank" rel="noreferrer"
                  className="font-medium underline-offset-4 hover:underline">{c.title}</a>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {t("channels.lastChecked", { date: c.last_checked_at ? new Date(c.last_checked_at).toLocaleString("fr-FR") : t("channels.never") })}
                  {c.last_error && ` | ${t(`channels.error.${c.last_error}`)}`}
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-emerald-600" checked={c.auto_process}
                    disabled={!props.canAutoProcess || busy !== null}
                    onChange={(e) => run(`auto-${c.id}`, () => call(`/api/channels/${c.id}`, { method: "PATCH", body: JSON.stringify({ autoProcess: e.target.checked }) }))} />
                  {t("channels.auto")}
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" className={ghost} disabled={busy !== null}
                  onClick={() => run(`check-${c.id}`, () => call(`/api/channels/${c.id}/check`, { method: "POST" }))}>
                  {t("channels.checkNow")}
                </button>
                <button type="button" className={ghost} disabled={busy !== null}
                  onClick={() => run(`del-${c.id}`, () => call(`/api/channels/${c.id}`, { method: "DELETE" }))}>
                  {t("channels.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {props.canAdd && (
        <form onSubmit={add} className="grid max-w-xl gap-4">
          <h2 className="text-lg font-semibold">{t("channels.add")}</h2>
          <div className="grid gap-2">
            <label htmlFor={ids.input} className="text-sm font-medium">{t("channels.input")}</label>
            <input id={ids.input} name="channel" required className={field} aria-describedby={ids.help} placeholder="https://www.youtube.com/@" />
            <p id={ids.help} className="text-sm text-zinc-600 dark:text-zinc-400">{t("channels.inputHelp")}</p>
          </div>
          <label htmlFor={ids.auto} className="flex items-center gap-3 text-sm">
            <input id={ids.auto} name="auto" type="checkbox" className="size-4 accent-emerald-600" disabled={!props.canAutoProcess} />
            {t("channels.auto")}
          </label>
          <label htmlFor={ids.rights} className="flex items-start gap-3 text-sm">
            <input id={ids.rights} name="rights" type="checkbox" required className="mt-0.5 size-4 accent-emerald-600" />
            {t("channels.rights")}
          </label>
          <button type="submit" disabled={busy !== null}
            className="justify-self-start rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {t("channels.add")}
          </button>
        </form>
      )}
    </div>
  );
}

export type DetectedVideo = { id: string; title: string; youtube_video_id: string; published_at: string };

export function DetectedVideos({ videos }: { videos: DetectedVideo[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (videos.length === 0) return <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("channels.noNewVideos")}</p>;

  async function processVideo(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/channel-videos/${id}/process`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      return setError(code ? t(`upload.error.${code}`) : t("upload.error"));
    }
    const { jobId } = (await res.json()) as { jobId: string };
    router.push(`/app/jobs/${jobId}`);
  }

  return (
    <div className="grid gap-3">
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {videos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="grid gap-0.5">
              <a href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{v.title}</a>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{new Date(v.published_at).toLocaleString("fr-FR")}</span>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => processVideo(v.id)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {t("channels.process")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
