import { logger, schedules } from "@trigger.dev/sdk";
import { pollDueChannels } from "../lib/channel-poller";

// Checks monitored YouTube channels (public RSS feeds, no API quota) every 15 minutes; each
// channel is polled at most every RSS_POLL_INTERVAL_MINUTES.
export const pollChannels = schedules.task({
  id: "poll-channels",
  cron: "*/15 * * * *",
  maxDuration: 600,
  run: async () => {
    const result = await pollDueChannels();
    logger.info("channels polled", result);
    return result;
  },
});
