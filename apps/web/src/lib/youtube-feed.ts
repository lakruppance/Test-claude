import { XMLParser } from "fast-xml-parser";

// Public channel RSS feed (no API key, no quota). Base URL overridable for tests.
const FEED_BASE = () => process.env.YOUTUBE_FEED_BASE ?? "https://www.youtube.com/feeds/videos.xml";
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export type FeedEntry = { videoId: string; title: string; published: string };
export type Feed = { title: string; entries: FeedEntry[] };

export function parseFeed(xml: string): Feed {
  const doc = new XMLParser({ ignoreAttributes: true }).parse(xml);
  const feed = doc.feed;
  if (!feed) throw new Error("not a YouTube feed");
  const raw = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];
  const entries: FeedEntry[] = raw
    .map((e: Record<string, unknown>) => ({
      videoId: String(e["yt:videoId"] ?? ""),
      title: String(e.title ?? ""),
      published: String(e.published ?? ""),
    }))
    .filter((e: FeedEntry) => /^[A-Za-z0-9_-]{11}$/.test(e.videoId) && !Number.isNaN(Date.parse(e.published)));
  return { title: String(feed.title ?? ""), entries };
}

export async function fetchFeed(channelId: string): Promise<Feed> {
  if (!CHANNEL_ID.test(channelId)) throw new Error("invalid channel id");
  const res = await fetch(`${FEED_BASE()}?channel_id=${channelId}`, {
    headers: { accept: "application/atom+xml" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 404) throw new ChannelError("channel_not_found");
  if (!res.ok) throw new ChannelError("feed_unavailable");
  return parseFeed(await res.text());
}

export class ChannelError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Accepts a channel id, a /channel/UC... URL, an @handle or a youtube.com/@handle URL.
export async function resolveChannelId(input: string): Promise<string> {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return value;
  const fromUrl = value.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1];
  if (fromUrl) return fromUrl;
  const handle = value.match(/(?:youtube\.com\/)?(@[A-Za-z0-9._-]{3,100})/)?.[1];
  if (!handle) throw new ChannelError("invalid_channel");
  // Handles need the channel page; YouTube may refuse datacenter requests, in which case the
  // user is asked for the channel URL (youtube.com/channel/UC...) instead.
  try {
    const res = await fetch(`https://www.youtube.com/${handle}`, {
      headers: { "accept-language": "en" },
      signal: AbortSignal.timeout(15_000),
    });
    const html = res.ok ? await res.text() : "";
    const id =
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
      html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1];
    if (id) return id;
  } catch {
    // fall through
  }
  throw new ChannelError("channel_not_resolved");
}
