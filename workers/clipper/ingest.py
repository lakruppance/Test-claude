"""Fetch a source video from a link: Google Drive or Dropbox share links, or a YouTube URL.

Only publicly shared files are fetched. YouTube downloads go through yt-dlp; an optional proxy
(YTDLP_PROXY_URL) is used only when configured. No protection is circumvented: bot checks,
private, members-only or age-restricted videos fail with a clear error that points the user to
direct upload."""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import httpx

from .pipeline import PipelineError

DRIVE_HOSTS = {"drive.google.com", "docs.google.com"}
DROPBOX_HOSTS = {"www.dropbox.com", "dropbox.com", "dl.dropboxusercontent.com"}
YOUTUBE_HOSTS = {"www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be",
                 "music.youtube.com"}

DRIVE_ID = re.compile(r"/(?:file/d|open)/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})")
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

CHUNK = 1024 * 1024


def detect_kind(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host in DRIVE_HOSTS:
        return "drive"
    if host in DROPBOX_HOSTS:
        return "dropbox"
    if host in YOUTUBE_HOSTS:
        return "youtube"
    raise PipelineError("unsupported_url",
                        "Only Google Drive, Dropbox and YouTube links are supported")


def drive_download_url(url: str) -> str:
    match = DRIVE_ID.search(url)
    if not match:
        raise PipelineError("invalid_url", "This Google Drive link does not contain a file id")
    file_id = match.group(1) or match.group(2)
    base = os.environ.get("DRIVE_DOWNLOAD_BASE", "https://drive.usercontent.google.com/download")
    return f"{base}?{urlencode({'id': file_id, 'export': 'download', 'confirm': 't'})}"


def dropbox_download_url(url: str) -> str:
    parts = urlparse(url)
    query = {k: v for k, v in parse_qs(parts.query).items() if k != "dl"}
    query["dl"] = ["1"]
    return urlunparse(parts._replace(query=urlencode(query, doseq=True)))


def youtube_video_id(url: str) -> str:
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    candidate = ""
    if host == "youtu.be":
        candidate = parts.path.lstrip("/").split("/")[0]
    elif parts.path == "/watch":
        candidate = parse_qs(parts.query).get("v", [""])[0]
    else:
        match = re.match(r"^/(?:shorts|live|embed)/([^/?#]+)", parts.path)
        candidate = match.group(1) if match else ""
    if not YOUTUBE_ID.match(candidate):
        raise PipelineError("invalid_url", "This YouTube link does not point to a video")
    return candidate


def filename_from_disposition(header: str) -> str | None:
    from urllib.parse import unquote

    match = re.search(r"filename\*=UTF-8''([^;]+)", header, re.I)
    if match:
        return unquote(match.group(1)).strip()[:255] or None
    match = re.search(r'filename="?([^";]+)"?', header, re.I)
    return match.group(1).strip()[:255] if match else None


def download_http(url: str, dest: Path, max_bytes: int, client: httpx.Client | None = None
                  ) -> tuple[int, str | None]:
    """Stream a publicly shared file. An HTML answer means the file is not publicly shared."""
    own = client is None
    client = client or httpx.Client(follow_redirects=True, timeout=httpx.Timeout(60, connect=15))
    try:
        with client.stream("GET", url) as response:
            if response.status_code in (401, 403, 404):
                raise PipelineError("file_not_shared",
                                    "The file is not shared publicly (anyone with the link)")
            if response.status_code >= 400:
                raise RuntimeError(f"Download failed with HTTP {response.status_code}")
            content_type = response.headers.get("content-type", "")
            if content_type.startswith("text/html"):
                raise PipelineError("file_not_shared",
                                    "The link opens a web page instead of the file. Share it "
                                    "with 'anyone with the link'")
            filename = filename_from_disposition(response.headers.get("content-disposition", ""))
            declared = int(response.headers.get("content-length") or 0)
            if declared > max_bytes:
                raise PipelineError("file_too_large", "The file exceeds the maximum size")
            written = 0
            with dest.open("wb") as fh:
                for chunk in response.iter_bytes(CHUNK):
                    written += len(chunk)
                    if written > max_bytes:
                        raise PipelineError("file_too_large", "The file exceeds the maximum size")
                    fh.write(chunk)
            return written, filename
    finally:
        if own:
            client.close()


# yt-dlp error message fragments -> stable error codes (checked in order).
YOUTUBE_ERRORS: list[tuple[str, tuple[str, ...]]] = [
    ("youtube_blocked", ("confirm you're not a bot", "confirm you’re not a bot", "http error 429",
                         "too many requests", "http error 403", "403 forbidden",
                         "unable to download webpage", "unable to download api page",
                         "tunnel connection failed", "sign in to confirm")),
    ("video_private", ("private video",)),
    ("video_members_only", ("members-only", "join this channel")),
    ("video_age_restricted", ("age-restricted", "confirm your age",
                              "inappropriate for some users")),
    ("video_live", ("live event will begin", "is live", "premieres in")),
    ("video_unavailable", ("video unavailable", "has been removed", "not available",
                           "does not exist")),
]

YOUTUBE_MESSAGES = {
    "youtube_blocked": "YouTube blocked the download from our servers. Download the video from "
                       "YouTube Studio and upload the file directly",
    "video_private": "This video is private",
    "video_members_only": "This video is reserved to channel members",
    "video_age_restricted": "This video is age-restricted",
    "video_live": "Live streams and premieres cannot be processed until they are over",
    "video_unavailable": "This video is unavailable",
}


def classify_youtube_error(message: str) -> PipelineError | None:
    lowered = message.lower()
    for code, needles in YOUTUBE_ERRORS:
        if any(n in lowered for n in needles):
            return PipelineError(code, YOUTUBE_MESSAGES[code])
    return None


def youtube_options(outtmpl: str) -> dict:
    options = {
        "format": ("bv*[height<=1080][ext=mp4]+ba[ext=m4a]"
                   "/b[height<=1080][ext=mp4]/b[height<=1080]/b"),
        "merge_output_format": "mp4",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
        "noprogress": True,
    }
    proxy = os.environ.get("YTDLP_PROXY_URL")
    if proxy:  # only when explicitly configured
        options["proxy"] = proxy
    return options


def download_youtube(url: str, dest_dir: Path, max_minutes: float, max_bytes: int,
                     ydl_factory=None) -> tuple[Path, dict]:
    if os.environ.get("YTDLP_ENABLED", "true") != "true":
        raise PipelineError("youtube_disabled", "YouTube import is disabled")
    video_id = youtube_video_id(url)
    if ydl_factory is None:
        from yt_dlp import YoutubeDL as ydl_factory  # noqa: N813
    from yt_dlp.utils import DownloadError

    options = youtube_options(str(dest_dir / "%(id)s.%(ext)s"))
    options["max_filesize"] = max_bytes
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        with ydl_factory(options) as ydl:
            info = ydl.extract_info(watch_url, download=False)
            if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
                raise PipelineError("video_live", YOUTUBE_MESSAGES["video_live"])
            duration = float(info.get("duration") or 0)
            if duration > max_minutes * 60:
                raise PipelineError("source_too_long",
                                    "The video exceeds the maximum duration for this plan",
                                    {"duration": duration, "max_minutes": max_minutes})
            ydl.download([watch_url])
    except DownloadError as exc:
        classified = classify_youtube_error(str(exc))
        if classified:
            raise classified from exc
        raise
    files = sorted(dest_dir.glob(f"{video_id}.*"), key=lambda p: p.stat().st_size, reverse=True)
    files = [f for f in files if f.suffix in (".mp4", ".mkv", ".webm")]
    if not files:
        raise RuntimeError("yt-dlp finished without producing a video file")
    meta = {"title": info.get("title") or video_id, "duration": duration, "video_id": video_id,
            "channel_id": info.get("channel_id")}
    return files[0], meta
