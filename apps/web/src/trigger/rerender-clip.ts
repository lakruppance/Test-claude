import { task, wait } from "@trigger.dev/sdk";
import { runRerender } from "../lib/rerender";

export const rerenderClip = task({
  id: "rerender-clip",
  maxDuration: 900,
  run: async (payload: { clipId: string }) => {
    await runRerender(payload.clipId, (seconds) => wait.for({ seconds }), 5);
  },
});
