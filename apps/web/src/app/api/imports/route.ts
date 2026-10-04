import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccount, jobCreationBlocked } from "@/lib/account";
import { env } from "@/lib/env";
import { createLinkJob, requestContext } from "@/lib/jobs";
import { detectLink } from "@/lib/sources";
import { currentUser } from "@/lib/supabase/server";

const body = z.object({
  url: z.string().min(8).max(2000),
  style: z.enum(["impact", "boite", "epure"]).optional(),
  withHook: z.boolean().optional(),
  rightsCertified: z.literal(true),
});

// Import from a Google Drive / Dropbox share link or a YouTube URL. The worker downloads it.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const link = detectLink(parsed.data.url);
  if ("error" in link) return NextResponse.json({ error: link.error }, { status: 400 });
  if (link.kind === "youtube" && process.env.YTDLP_ENABLED === "false") {
    return NextResponse.json({ error: "youtube_disabled" }, { status: 400 });
  }

  const account = await getAccount(user.id);
  if (account.minutesRemaining <= 0) return NextResponse.json({ error: "quota_exhausted" }, { status: 402 });
  const blocked = await jobCreationBlocked(user.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const jobId = await createLinkJob({
    userId: user.id,
    kind: link.kind,
    url: link.url,
    title: link.url,
    style: parsed.data.style ?? env().CLIP_STYLE_DEFAULT,
    withHook: parsed.data.withHook ?? true,
    rights: { contentKind: link.kind, contentRef: link.url, ...requestContext(request) },
  });
  return NextResponse.json({ jobId });
}
