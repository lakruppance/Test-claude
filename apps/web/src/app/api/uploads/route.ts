import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccount, jobCreationBlocked } from "@/lib/account";
import { env } from "@/lib/env";
import { startMultipartUpload } from "@/lib/r2";
import { RIGHTS_STATEMENT, RIGHTS_STATEMENT_VERSION } from "@/lib/rights";
import { ACCEPTED_TYPES, planParts, sourceKey } from "@/lib/storage-keys";
import { currentUser } from "@/lib/supabase/server";
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

// Creates the job for the signed-in user and returns presigned URLs for a multipart upload
// straight to object storage.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { filename, size, contentType, style, withHook } = parsed.data;
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (size > env().MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  const account = await getAccount(user.id);
  if (account.minutesRemaining <= 0) {
    return NextResponse.json({ error: "quota_exhausted" }, { status: 402 });
  }
  const blocked = await jobCreationBlocked(user.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const jobId = crypto.randomUUID();
  const key = sourceKey(user.id, jobId, contentType);
  const { partSize, count } = planParts(size);
  const { uploadId, urls } = await startMultipartUpload(key, contentType, count);

  const db = supabaseAdmin();
  const { error } = await db.from("jobs").insert({
    id: jobId,
    user_id: user.id,
    status: "uploading",
    source_key: key,
    source_filename: filename,
    source_bytes: size,
    options: { style: style ?? env().CLIP_STYLE_DEFAULT, with_hook: withHook ?? true, upload_id: uploadId },
  });
  if (error) return NextResponse.json({ error: "database_error" }, { status: 500 });

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { error: rightsError } = await db.from("rights_declarations").insert({
    user_id: user.id,
    job_id: jobId,
    content_kind: "upload",
    content_ref: filename,
    statement_version: RIGHTS_STATEMENT_VERSION,
    statement: RIGHTS_STATEMENT,
    ip_address: forwarded && /^[0-9a-fA-F.:]+$/.test(forwarded) ? forwarded : null,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (rightsError) {
    await db.from("jobs").delete().eq("id", jobId);
    return NextResponse.json({ error: "database_error" }, { status: 500 });
  }

  return NextResponse.json({ jobId, partSize, urls });
}
