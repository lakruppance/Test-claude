// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ORCHESTRATOR === "local") {
    const { resumeLocalJobs } = await import("./lib/local-runner");
    await resumeLocalJobs().catch((e) => console.error("resume failed", e));
  }
}
