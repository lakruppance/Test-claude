"""Create the local S3 bucket (SeaweedFS) and its CORS rule. Idempotent."""

import os
import time

import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
    config=Config(s3={"addressing_style": "path"}),
)
bucket = os.environ["R2_BUCKET"]
for attempt in range(30):  # the S3 gateway takes a few seconds to come up
    try:
        existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("Local S3 storage is not reachable")
if bucket not in existing:
    s3.create_bucket(Bucket=bucket)
s3.put_bucket_cors(
    Bucket=bucket,
    CORSConfiguration={
        "CORSRules": [
            {
                "AllowedOrigins": [os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")],
                "AllowedMethods": ["PUT", "GET", "HEAD"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": ["ETag"],
            }
        ]
    },
)
# SeaweedFS allocates storage volumes lazily on the first write: warm up with a test object so
# the first browser upload does not hit a "volume not ready" error.
for attempt in range(30):
    try:
        s3.put_object(Bucket=bucket, Key=".warmup", Body=b"ok" * 1024 * 1024)
        s3.delete_object(Bucket=bucket, Key=".warmup")
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("Local S3 storage did not accept writes")
print(f"Local bucket '{bucket}' ready.")
