// Recognizes supported links. Mirrors workers/clipper/ingest.py (the worker re-validates).
export type LinkKind = "drive" | "dropbox" | "youtube";

const HOSTS: Record<LinkKind, string[]> = {
  drive: ["drive.google.com", "docs.google.com"],
  dropbox: ["www.dropbox.com", "dropbox.com", "dl.dropboxusercontent.com"],
  youtube: ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"],
};

export function detectLink(raw: string): { kind: LinkKind; url: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "https:") return { error: "invalid_url" };
  const host = url.hostname.toLowerCase();
  const kind = (Object.keys(HOSTS) as LinkKind[]).find((k) => HOSTS[k].includes(host));
  if (!kind) return { error: "unsupported_url" };
  if (kind === "youtube" && !youtubeVideoId(url)) return { error: "invalid_url" };
  if (kind === "drive" && !/\/(file\/d|open)\/[\w-]{20,}|[?&]id=[\w-]{20,}/.test(url.href)) {
    return { error: "invalid_url" };
  }
  return { kind, url: url.href };
}

export function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let id = "";
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
  else id = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] ?? "";
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
