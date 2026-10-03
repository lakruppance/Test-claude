// Mirrors workers/clipper/storage.py. Lifecycle rules expire `sources/` and `outputs/` separately.
export const sourcePrefix = (ownerId: string, jobId: string) => `sources/${ownerId}/${jobId}`;
export const outputPrefix = (ownerId: string, jobId: string) => `outputs/${ownerId}/${jobId}`;

export const ANONYMOUS_OWNER = "anonymous";

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

export function sourceKey(ownerId: string, jobId: string, contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error(`Unsupported content type: ${contentType}`);
  return `${sourcePrefix(ownerId, jobId)}/source.${ext}`;
}

export const ACCEPTED_TYPES = Object.keys(EXTENSIONS);

// S3/R2 multipart: parts of at least 5 MiB, at most 10,000 parts.
export function planParts(size: number, preferred = 16 * 1024 ** 2): { partSize: number; count: number } {
  if (size <= 0) throw new Error("Empty file");
  let partSize = Math.max(preferred, 5 * 1024 ** 2);
  while (Math.ceil(size / partSize) > 10_000) partSize *= 2;
  return { partSize, count: Math.ceil(size / partSize) };
}
