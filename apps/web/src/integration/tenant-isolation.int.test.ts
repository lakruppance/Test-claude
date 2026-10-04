// Integration test against a running Supabase (local stack or CI): two real accounts, real JWTs,
// real PostgREST. Proves that user A can neither read nor modify anything belonging to user B.
// Run: npm run test:integration (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Tenant = { id: string; client: SupabaseClient; jobId: string; segmentId: string };
const password = "Isolation-Test-2026";
const stamp = Date.now();

async function makeTenant(name: string): Promise<Tenant> {
  const email = `${name}-${stamp}@isolation.test`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = created.user.id;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const jobId = crypto.randomUUID();
  await admin.from("jobs").insert({ id: jobId, user_id: id, source_key: `sources/${id}/${jobId}/source.mp4`, status: "succeeded" }).throwOnError();
  await admin.from("job_steps").insert({ job_id: jobId, user_id: id, step: "prepare", status: "succeeded" }).throwOnError();
  await admin.from("transcripts").insert({ job_id: jobId, user_id: id, language: "fr", duration_seconds: 60, source: "test", words: [] }).throwOnError();
  const { data: seg } = await admin.from("segments").insert({
    job_id: jobId, user_id: id, rank: 1, start_seconds: 0, end_seconds: 30, score_global: 80, hook: 80,
    autonomie: 80, intensite: 80, chute: 80, justification: "j", titre_propose: "t", sentence_start: 0, sentence_end: 3,
  }).select("id").single().throwOnError();
  await admin.from("clips").insert({
    job_id: jobId, segment_id: seg!.id, user_id: id, style: "impact", reframe_mode: "track",
    storage_key: `outputs/${id}/${jobId}/clips/01-impact.mp4`, width: 1080, height: 1920, duration_seconds: 30, bytes: 1,
  }).throwOnError();
  await admin.from("cost_events").insert({ job_id: jobId, user_id: id, step: "render", provider: "modal", item: "r", quantity: 1, unit: "core_second", usd: 0.01 }).throwOnError();
  await admin.from("rights_declarations").insert({ user_id: id, job_id: jobId, content_kind: "upload", content_ref: "x.mp4", statement_version: "v", statement: "s" }).throwOnError();
  await admin.rpc("reserve_minutes", { p_user: id, p_job: jobId, p_minutes: 1 });
  const channelSuffix = (name + "x".repeat(22)).slice(0, 22);
  const { data: channel } = await admin.from("channels").insert({ user_id: id, youtube_channel_id: `UC${channelSuffix}`, title: name })
    .select("id").single().throwOnError();
  await admin.from("channel_videos").insert({ channel_id: channel!.id, user_id: id, youtube_video_id: `${name}xxxxxxxxxxx`.slice(0, 11), title: "v", published_at: new Date().toISOString() }).throwOnError();
  return { id, client, jobId, segmentId: seg!.id };
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await makeTenant("alice");
  b = await makeTenant("bob");
}, 30_000);

afterAll(async () => {
  for (const t of [a, b]) if (t) await admin.auth.admin.deleteUser(t.id);
});

const TABLES = ["jobs", "job_steps", "transcripts", "segments", "clips", "rights_declarations", "usage_events", "profiles", "channels", "channel_videos"] as const;

describe("tenant isolation through the API (RLS)", () => {
  it.each(TABLES)("A reads only own rows in %s", async (table) => {
    const { data, error } = await a.client.from(table).select("*");
    expect(error).toBeNull();
    const owners = (data ?? []).map((r: Record<string, unknown>) => (table === "profiles" ? r.id : r.user_id));
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.every((o) => o === a.id)).toBe(true);
  });

  it("A cannot fetch B's job, clip or segment by id", async () => {
    expect((await a.client.from("jobs").select("id").eq("id", b.jobId)).data).toEqual([]);
    expect((await a.client.from("clips").select("id").eq("job_id", b.jobId)).data).toEqual([]);
    expect((await a.client.from("segments").select("id").eq("id", b.segmentId)).data).toEqual([]);
  });

  it("A cannot read cost events at all", async () => {
    expect((await a.client.from("cost_events").select("*")).data).toEqual([]);
  });

  it("A cannot modify or delete B's data", async () => {
    const update = await a.client.from("jobs").update({ status: "failed" }).eq("id", b.jobId).select();
    expect(update.error?.code ?? "").toBe("42501");
    const del = await a.client.from("clips").delete().eq("job_id", b.jobId);
    expect(del.error?.code ?? "").toBe("42501");
    const { data: bJob } = await admin.from("jobs").select("status").eq("id", b.jobId).single();
    expect(bJob!.status).toBe("succeeded");
  });

  it("A cannot create rows owned by B, nor grant itself plan, admin or minutes", async () => {
    expect((await a.client.from("jobs").insert({ user_id: b.id, source_key: "x" })).error?.code).toBe("42501");
    expect((await a.client.from("profiles").update({ is_admin: true }).eq("id", a.id)).error?.code).toBe("42501");
    expect((await a.client.from("profiles").update({ plan_id: "studio" }).eq("id", a.id)).error?.code).toBe("42501");
    expect((await a.client.rpc("reserve_minutes", { p_user: a.id, p_job: a.jobId, p_minutes: -500 })).error).not.toBeNull();
    expect((await a.client.rpc("release_minutes", { p_job: a.jobId })).error).not.toBeNull();
  });

  it("A's quota view only counts A", async () => {
    expect(Number((await a.client.rpc("minutes_used", { p_user: a.id })).data)).toBe(1);
    expect(Number((await a.client.rpc("minutes_used", { p_user: b.id })).data)).toBe(0);
  });

  it("an anonymous visitor sees nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const table of TABLES) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
  });
});
