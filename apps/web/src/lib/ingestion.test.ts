import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectLink } from "./sources";
import { parseFeed, resolveChannelId } from "./youtube-feed";

describe("detectLink", () => {
  it.each([
    ["https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing", "drive"],
    ["https://www.dropbox.com/scl/fi/abc/talk.mp4?rlkey=x&dl=0", "dropbox"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
  ])("recognizes %s", (url, kind) => {
    expect(detectLink(url)).toMatchObject({ kind });
  });

  it.each([
    ["https://example.com/video.mp4", "unsupported_url"],
    ["http://youtu.be/dQw4w9WgXcQ", "invalid_url"],
    ["https://www.youtube.com/@channel", "invalid_url"],
    ["https://drive.google.com/drive/folders", "invalid_url"],
    ["not a url", "invalid_url"],
  ])("rejects %s", (url, error) => {
    expect(detectLink(url)).toEqual({ error });
  });
});

describe("YouTube RSS", () => {
  it("parses entries and the channel title", () => {
    const feed = parseFeed(readFileSync(new URL("./__fixtures__/feed.xml", import.meta.url), "utf8"));
    expect(feed.title).toBe("Ma Chaîne Test");
    expect(feed.entries.map((e) => e.videoId)).toEqual(["AAAAAAAAAA1", "AAAAAAAAAA0"]);
    expect(feed.entries[0].title).toBe("Épisode 2 : comment gagner du temps");
  });

  it("resolves channel ids from ids and /channel/ URLs without network", async () => {
    expect(await resolveChannelId("UCaaaaaaaaaaaaaaaaaaaaaa")).toBe("UCaaaaaaaaaaaaaaaaaaaaaa");
    expect(await resolveChannelId("https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa/videos")).toBe("UCaaaaaaaaaaaaaaaaaaaaaa");
    await expect(resolveChannelId("https://example.com")).rejects.toMatchObject({ code: "invalid_channel" });
  });
});
