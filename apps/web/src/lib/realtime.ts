import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/browser";

// Subscribes to row changes of `table` matching `filter`, after authenticating the Realtime
// connection with the user's session (otherwise RLS treats it as anonymous and drops events).
export function subscribeToRows(
  name: string,
  table: string,
  filter: string,
  onChange: (row: Record<string, unknown>) => void,
): () => void {
  const supabase = supabaseBrowser();
  let channel: RealtimeChannel | null = null;
  let closed = false;
  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (closed || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    channel = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, (change) =>
        onChange(change.new as Record<string, unknown>),
      )
      .subscribe();
  })();
  return () => {
    closed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
