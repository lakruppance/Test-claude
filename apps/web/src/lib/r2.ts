import "server-only";
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let client: S3Client | undefined;

function s3(): S3Client {
  if (!client) {
    const e = env();
    client = new S3Client({
      region: "auto",
      endpoint: e.R2_ENDPOINT,
      credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
      // MinIO (local) needs path-style URLs; R2 works with either.
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      // The SDK otherwise signs a CRC32 of the (empty) body into presigned part URLs, and the
      // browser's real upload is then rejected with BadDigest (R2 and local S3 alike).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export async function startMultipartUpload(key: string, contentType: string, partCount: number) {
  const e = env();
  const { UploadId } = await s3().send(
    new CreateMultipartUploadCommand({ Bucket: e.R2_BUCKET, Key: key, ContentType: contentType }),
  );
  if (!UploadId) throw new Error("R2 did not return an upload id");
  const urls = await Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(
        s3(),
        new UploadPartCommand({ Bucket: e.R2_BUCKET, Key: key, UploadId, PartNumber: i + 1 }),
        { expiresIn: 6 * 3600 },
      ),
    ),
  );
  return { uploadId: UploadId, urls };
}

// Parts already received for an unfinished multipart upload, plus fresh URLs for the others.
export async function resumeMultipartUpload(key: string, uploadId: string, partCount: number) {
  const e = env();
  const uploaded: { partNumber: number; etag: string }[] = [];
  let marker: string | undefined;
  do {
    const page = await s3().send(
      new ListPartsCommand({ Bucket: e.R2_BUCKET, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    );
    for (const p of page.Parts ?? []) {
      if (p.PartNumber && p.ETag) uploaded.push({ partNumber: p.PartNumber, etag: p.ETag });
    }
    marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
  } while (marker);
  const done = new Set(uploaded.map((p) => p.partNumber));
  const urls: Record<number, string> = {};
  for (let n = 1; n <= partCount; n++) {
    if (!done.has(n)) {
      urls[n] = await getSignedUrl(
        s3(),
        new UploadPartCommand({ Bucket: e.R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: n }),
        { expiresIn: 6 * 3600 },
      );
    }
  }
  return { uploaded, urls };
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: env().R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

// Short-lived download URL. Callers must check ownership of `key` before calling this.
export async function signedDownloadUrl(key: string, filename?: string): Promise<string> {
  const e = env();
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: e.R2_BUCKET,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    }),
    { expiresIn: e.R2_SIGNED_URL_TTL_SECONDS },
  );
}
