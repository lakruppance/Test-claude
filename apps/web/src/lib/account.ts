import { supabaseAdmin } from "./supabase-admin";

export type Plan = {
  id: string;
  name: string;
  monthly_minutes: number;
  max_video_minutes: number;
  watermark: boolean;
  direct_publish: boolean;
  channel_monitoring: boolean;
  max_channels: number;
};

export type Account = {
  userId: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  plan: Plan;
  minutesUsed: number;
  minutesRemaining: number;
};

// Server-side view of a user's account (plan, admin flag, quota). The caller must already have
// authenticated `userId` (currentUser()).
export async function getAccount(userId: string): Promise<Account> {
  const db = supabaseAdmin();
  const [{ data: profile, error }, { data: used }] = await Promise.all([
    db
      .from("profiles")
      .select("email, display_name, is_admin, plans(*)")
      .eq("id", userId)
      .single(),
    db.rpc("minutes_used", { p_user: userId }),
  ]);
  if (error || !profile) throw new Error(`Profile not found for ${userId}`);
  const plan = profile.plans as unknown as Plan;
  const minutesUsed = Number(used ?? 0);
  return {
    userId,
    email: profile.email,
    displayName: profile.display_name,
    isAdmin: profile.is_admin,
    plan,
    minutesUsed,
    minutesRemaining: Math.max(0, plan.monthly_minutes - minutesUsed),
  };
}

// Abuse limits on job creation, independent of the minutes quota.
export const LIMITS = { activeJobs: 3, jobsPerDay: 20 };

export async function jobCreationBlocked(userId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [active, recent] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .in("status", ["uploading", "queued", "running"]),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId)
      .gte("created_at", since),
  ]);
  if ((active.count ?? 0) >= LIMITS.activeJobs) return "too_many_active_jobs";
  if ((recent.count ?? 0) >= LIMITS.jobsPerDay) return "daily_job_limit";
  return null;
}
