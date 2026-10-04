"""Cloudflare R2 (S3 API) object storage. Object keys are always prefixed by the owner id."""

from __future__ import annotations

import os
from pathlib import Path


# Two top-level areas so bucket lifecycle rules (prefix-based) can expire them separately:
#   sources/  uploaded videos and extracted audio, deleted after SOURCE_RETENTION_DAYS
#   outputs/  transcript, segments and rendered clips, deleted after CLIP_RETENTION_DAYS
def source_prefix(owner_id: str, job_id: str) -> str:
    return f"sources/{owner_id}/{job_id}"


def output_prefix(owner_id: str, job_id: str) -> str:
    return f"outputs/{owner_id}/{job_id}"


class R2:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self.bucket = os.environ["R2_BUCKET"]
        self._s3 = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_ENDPOINT"],
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
            config=Config(
                retries={"max_attempts": 5, "mode": "standard"},
                # Local S3 (SeaweedFS) needs path-style addressing; R2 accepts both.
                s3={"addressing_style": "path"
                    if os.environ.get("S3_FORCE_PATH_STYLE") == "true" else "auto"},
            ),
        )

    def download(self, key: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        self._s3.download_file(self.bucket, key, str(dest))
        return dest

    def upload(self, src: Path, key: str, content_type: str) -> int:
        self._s3.upload_file(str(src), self.bucket, key, ExtraArgs={"ContentType": content_type})
        return src.stat().st_size

    def put_json(self, key: str, body: str) -> int:
        data = body.encode("utf-8")
        self._s3.put_object(Bucket=self.bucket, Key=key, Body=data,
                            ContentType="application/json")
        return len(data)

    def get_text(self, key: str) -> str:
        return self._s3.get_object(Bucket=self.bucket, Key=key)["Body"].read().decode("utf-8")
