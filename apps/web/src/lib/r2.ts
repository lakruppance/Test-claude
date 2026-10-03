import "server-only";
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
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
