// Browser-side multipart upload straight to R2 with presigned part URLs.
// Parts are sent 4 at a time and each part is retried up to 3 times.

export type UploadStart = { jobId: string; partSize: number; urls: string[] };

export async function uploadParts(
  file: File,
  start: UploadStart,
  onProgress: (ratio: number) => void,
  concurrency = 4,
): Promise<{ partNumber: number; etag: string }[]> {
  const loaded = new Array<number>(start.urls.length).fill(0);
  const parts: { partNumber: number; etag: string }[] = [];
  let next = 0;

  const sendPart = async (index: number) => {
    const blob = file.slice(index * start.partSize, Math.min(file.size, (index + 1) * start.partSize));
    for (let attempt = 1; ; attempt++) {
      try {
        const etag = await put(start.urls[index], blob, (n) => {
          loaded[index] = n;
          onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);
        });
        parts.push({ partNumber: index + 1, etag });
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  };

  const worker = async () => {
    while (next < start.urls.length) await sendPart(next++);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, start.urls.length) }, worker));
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
