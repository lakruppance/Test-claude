import { supabaseAdmin } from "./supabase-admin";
import { pollCall, startStep } from "./worker";

// Re-renders one clip (new bounds, style or hook). Runs inside Trigger.dev (task
// "rerender-clip") or in-process locally. Failures are recorded on the clip.
export async function runRerender(clipId: string, sleep: (s: number) => Promise<void>, pollSeconds = 5) {
  const db = supabaseAdmin();
  const { data: clip } = await db
    .from("clips")
    .select("id, job_id, segment_id, user_id, style, with_hook")
    .eq("id", clipId)
    .single();
  if (!clip) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const callId = await startStep("render", {
      job_id: clip.job_id,
      owner_id: clip.user_id,
      user_id: clip.user_id,
      attempt,
      segment_id: clip.segment_id,
      style: clip.style,
      with_hook: clip.with_hook,
      clip_id: clip.id,
    });
    for (;;) {
      await sleep(pollSeconds);
      const status = await pollCall(callId);
      if (status.status === "pending") continue;
      if (status.status === "succeeded") return; // the worker resets the clip to pending_review
      if (!status.retryable || attempt === 3) {
        await db.from("clips").update({ status: "render_failed", render_error: status.code }).eq("id", clipId);
        return;
      }
      break;
    }
  }
}
