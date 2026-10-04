// Browser-side multipart upload straight to object storage with presigned part URLs.
// Parts are sent 4 at a time and retried up to 3 times. Progress is saved in localStorage so an
// upload interrupted by a closed tab or a network loss resumes where it stopped when the same
// file is selected again.

export type Part = { partNumber: number; etag: string };
export type UploadPlan = {
  jobId: string;
  partSize: number;
  partCount: number;
  uploaded: Part[];
  urls: Record<number, string>; // part number -> presigned URL, for parts still missing
};

const STORE = "clips.uploads.v1";

export function fileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberUpload(file: File, jobId: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...readStore(), [fileFingerprint(file)]: jobId }));
  } catch {
    // storage unavailable: the upload still works, it just cannot resume after a reload
  }
}

export function forgetUpload(file: File) {
  try {
    const store = readStore();
    delete store[fileFingerprint(file)];
    localStorage.setItem(STORE, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function pendingUploadFor(file: File): string | null {
  return readStore()[fileFingerprint(file)] ?? null;
}

export async function uploadParts(
  file: File,
  plan: UploadPlan,
  onProgress: (ratio: number) => void,
  concurrency = 4,
): Promise<Part[]> {
  const parts: Part[] = [...plan.uploaded];
  const missing = Object.keys(plan.urls).map(Number).sort((a, b) => a - b);
  const sizeOf = (n: number) => Math.min(file.size, n * plan.partSize) - (n - 1) * plan.partSize;
  const alreadyDone = plan.uploaded.reduce((sum, p) => sum + sizeOf(p.partNumber), 0);
  const loaded: Record<number, number> = {};
  const report = () =>
    onProgress((alreadyDone + Object.values(loaded).reduce((a, b) => a + b, 0)) / file.size);
  report();

  const sendPart = async (n: number) => {
    const blob = file.slice((n - 1) * plan.partSize, Math.min(file.size, n * plan.partSize));
    for (let attempt = 1; ; attempt++) {
      try {
        const etag = await put(plan.urls[n], blob, (bytes) => {
          loaded[n] = bytes;
          report();
        });
        parts.push({ partNumber: n, etag });
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < missing.length) await sendPart(missing[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

function put(url: string, blob: Blob, onBytes: (n: number) => void): Promise<string> {
  // XMLHttpRequest (not fetch) to get upload progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`Part upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(blob);
  });
}
