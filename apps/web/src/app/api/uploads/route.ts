import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { startMultipartUpload } from "@/lib/r2";
import { ACCEPTED_TYPES, ANONYMOUS_OWNER, planParts, sourceKey } from "@/lib/storage-keys";
import { supabaseAdmin } from "@/lib/supabase-admin";

const body = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string(),
  style: z.enum(["impact", "boite", "epure"]).optional(),
  withHook: z.boolean().optional(),
  // Ownership/permission declaration, required for every added video.
  rightsCertified: z.literal(true),
});

// Creates the job and returns presigned URLs for a multipart upload straight to R2.
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { filename, size, contentType, style, withHook } = parsed.data;
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (size > env().MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const jobId = crypto.randomUUID();
  const key = sourceKey(ANONYMOUS_OWNER, jobId, contentType);
  const { partSize, count } = planParts(size);
  const { uploadId, urls } = await startMultipartUpload(key, contentType, count);

  const { error } = await supabaseAdmin().from("jobs").insert({
    id: jobId,
    user_id: null,
    status: "uploading",
    source_key: key,
    source_filename: filename,
    source_bytes: size,
    options: {
      style: style ?? env().CLIP_STYLE_DEFAULT,
      with_hook: withHook ?? true,
      upload_id: uploadId,
      // Phase 2 moves this into a dedicated rights_declarations table tied to the user.
      rights_declaration: { certified_at: new Date().toISOString(), filename },
    },
  });
  if (error) return NextResponse.json({ error: "database_error" }, { status: 500 });

  return NextResponse.json({ jobId, partSize, urls });
}
