// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ORCHESTRATOR === "local") {
    const { resumeLocalJobs } = await import("./lib/local-runner");
    await resumeLocalJobs().catch((e) => console.error("resume failed", e));
    // Local replacement for the Trigger.dev schedule: check monitored channels periodically.
    const { pollDueChannels } = await import("./lib/channel-poller");
    setInterval(() => {
      pollDueChannels().catch((e) => console.error("channel poll failed", e));
    }, 5 * 60_000);
  }
}
