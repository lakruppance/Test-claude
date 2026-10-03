"""Configure the R2 bucket: CORS for browser multipart uploads and lifecycle rules that delete
source videos and outputs after their retention period. Idempotent; run from CI.

Env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, NEXT_PUBLIC_APP_URL,
     SOURCE_RETENTION_DAYS (default 7), CLIP_RETENTION_DAYS (default 90)"""

import os

import boto3

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
)
bucket = os.environ["R2_BUCKET"]
origins = [o.strip() for o in os.environ["NEXT_PUBLIC_APP_URL"].split(",") if o.strip()]

s3.put_bucket_cors(
    Bucket=bucket,
    CORSConfiguration={
        "CORSRules": [
            {
                "AllowedOrigins": origins,
                "AllowedMethods": ["PUT", "GET", "HEAD"],
                "AllowedHeaders": ["content-type"],
                "ExposeHeaders": ["ETag"],
                "MaxAgeSeconds": 3600,
            }
        ]
    },
)

s3.put_bucket_lifecycle_configuration(
    Bucket=bucket,
    LifecycleConfiguration={
        "Rules": [
            {
                "ID": "expire-sources",
                "Status": "Enabled",
                "Filter": {"Prefix": "sources/"},
                "Expiration": {"Days": int(os.environ.get("SOURCE_RETENTION_DAYS", "7"))},
            },
            {
                "ID": "expire-outputs",
                "Status": "Enabled",
                "Filter": {"Prefix": "outputs/"},
                "Expiration": {"Days": int(os.environ.get("CLIP_RETENTION_DAYS", "90"))},
            },
            {
                "ID": "abort-incomplete-uploads",
                "Status": "Enabled",
                "Filter": {"Prefix": ""},
                "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1},
            },
        ]
    },
)
print(f"Bucket {bucket}: CORS for {origins}, lifecycle rules applied.")
