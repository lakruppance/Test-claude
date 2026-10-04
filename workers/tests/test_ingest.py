import http.server
import threading
from pathlib import Path

import pytest
from yt_dlp.utils import DownloadError

from clipper.ingest import (
    classify_youtube_error,
    detect_kind,
    download_http,
    download_youtube,
    drive_download_url,
    dropbox_download_url,
    youtube_video_id,
)
from clipper.pipeline import PipelineError

VIDEO = b"\x00\x00\x00\x18ftypmp42" + b"x" * 200_000


@pytest.fixture(scope="module")
def server():
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path.startswith("/video"):
                self.send_response(200)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(len(VIDEO)))
                self.send_header("Content-Disposition", "attachment; filename=\"talk.mp4\"")
                self.end_headers()
                self.wfile.write(VIDEO)
            elif self.path.startswith("/html"):
                body = b"<html>Sign in</html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(403)
                self.end_headers()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.mark.parametrize("url,kind", [
    ("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing", "drive"),
    ("https://www.dropbox.com/scl/fi/abc/talk.mp4?rlkey=xyz&dl=0", "dropbox"),
    ("https://youtu.be/dQw4w9WgXcQ", "youtube"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube"),
])
def test_detect_kind(url, kind):
    assert detect_kind(url) == kind


def test_unsupported_url_is_a_clear_error():
    with pytest.raises(PipelineError) as err:
        detect_kind("https://example.com/video.mp4")
    assert err.value.code == "unsupported_url"


def test_link_rewrites():
    assert "id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345" in drive_download_url(
        "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view")
    assert "confirm=t" in drive_download_url("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345")
    rewritten = dropbox_download_url("https://www.dropbox.com/scl/fi/abc/talk.mp4?rlkey=xyz&dl=0")
    assert "dl=1" in rewritten and "rlkey=xyz" in rewritten and "dl=0" not in rewritten
    assert youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10") == "dQw4w9WgXcQ"
    assert youtube_video_id("https://youtu.be/dQw4w9WgXcQ?si=x") == "dQw4w9WgXcQ"
    with pytest.raises(PipelineError):
        youtube_video_id("https://www.youtube.com/@somechannel")


def test_download_http_success_and_failures(server, tmp_path):
    assert download_http(f"{server}/video", tmp_path / "a", 10**7) == (len(VIDEO), "talk.mp4")
    assert (tmp_path / "a").read_bytes() == VIDEO
    for path, code in (("/html", "file_not_shared"), ("/forbidden", "file_not_shared")):
        with pytest.raises(PipelineError) as err:
            download_http(f"{server}{path}", tmp_path / "b", 10**7)
        assert err.value.code == code
    with pytest.raises(PipelineError) as err:
        download_http(f"{server}/video", tmp_path / "c", 1000)
    assert err.value.code == "file_too_large"


@pytest.mark.parametrize("message,code", [
    ("ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies", "youtube_blocked"),
    ("ERROR: unable to download video data: HTTP Error 429: Too Many Requests", "youtube_blocked"),
    ("ERROR: [youtube] x: Private video. Sign in if you've been granted access", "video_private"),
    ("ERROR: [youtube] x: Unable to download API page: Tunnel connection failed: 403 Forbidden", "youtube_blocked"),
    ("ERROR: [youtube] x: Join this channel to get access to members-only content", "video_members_only"),
    ("ERROR: [youtube] x: Video unavailable. This video has been removed", "video_unavailable"),
])
def test_youtube_error_classification(message, code):
    assert classify_youtube_error(message).code == code


class FakeYDL:
    def __init__(self, info=None, error=None):
        self.info, self.error = info or {}, error

    def __call__(self, options):
        self.options = options
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download):
        if self.error:
            raise DownloadError(self.error)
        return {"title": "Ma vidéo", "duration": 600, **self.info}

    def download(self, urls):
        out = Path(self.options["outtmpl"].replace("%(id)s", "dQw4w9WgXcQ").replace("%(ext)s", "mp4"))
        out.write_bytes(VIDEO)


def test_youtube_download_and_limits(tmp_path, monkeypatch):
    monkeypatch.delenv("YTDLP_PROXY_URL", raising=False)
    fake = FakeYDL()
    path, meta = download_youtube("https://youtu.be/dQw4w9WgXcQ", tmp_path, 20, 10**9, ydl_factory=fake)
    assert path.read_bytes() == VIDEO and meta["title"] == "Ma vidéo"
    assert "proxy" not in fake.options  # never set unless explicitly configured

    with pytest.raises(PipelineError) as err:
        download_youtube("https://youtu.be/dQw4w9WgXcQ", tmp_path, 5, 10**9, ydl_factory=FakeYDL())
    assert err.value.code == "source_too_long"
    with pytest.raises(PipelineError) as err:
        download_youtube("https://youtu.be/dQw4w9WgXcQ", tmp_path, 60, 10**9,
                         ydl_factory=FakeYDL(info={"live_status": "is_live"}))
    assert err.value.code == "video_live"
    with pytest.raises(PipelineError) as err:
        download_youtube("https://youtu.be/dQw4w9WgXcQ", tmp_path, 60, 10**9,
                         ydl_factory=FakeYDL(error="Sign in to confirm you're not a bot"))
    assert err.value.code == "youtube_blocked"


def test_proxy_used_only_when_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("YTDLP_PROXY_URL", "http://proxy.example:8080")
    fake = FakeYDL()
    download_youtube("https://youtu.be/dQw4w9WgXcQ", tmp_path, 20, 10**9, ydl_factory=fake)
    assert fake.options["proxy"] == "http://proxy.example:8080"


def test_fetch_step_stores_drive_file(server, tmp_path, monkeypatch):
    from types import SimpleNamespace

    from clipper import pipeline
    from clipper.config import Settings
    from tests.test_pipeline import FakeDB, FakeR2

    monkeypatch.setenv("DRIVE_DOWNLOAD_BASE", f"{server}/video")
    r2, db = FakeR2(tmp_path / "bucket"), FakeDB()
    job = pipeline.JobRef(job_id="j1", owner_id="u1", user_id="u1")
    db.insert("jobs", {"id": "j1", "source_key": "sources/u1/j1/source.mp4", "source_kind": "drive",
                       "source_url": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"})
    out = pipeline.fetch(job, Settings(), r2, db, SimpleNamespace(cores=1, memory_gib=2))
    assert out["bytes"] == len(VIDEO) and out["kind"] == "drive" and out["title"] == "talk.mp4"
    assert (r2.root / "sources/u1/j1/source.mp4").read_bytes() == VIDEO
