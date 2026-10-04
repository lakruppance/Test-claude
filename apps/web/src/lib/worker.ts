// HTTP client for the Modal worker API (start a step, poll its result).

export type StepName = "fetch" | "prepare" | "transcribe" | "detect" | "render";

export type StepPayload = {
  job_id: string;
  owner_id: string;
  user_id: string;
  attempt: number;
  max_source_minutes?: number;
  segment_id?: string;
  style?: string;
  with_hook?: boolean;
};

export type CallStatus =
  | { status: "pending" }
  | { status: "succeeded"; result: Record<string, unknown> }
  | {
      status: "failed";
      retryable: boolean;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

function config() {
  const url = process.env.WORKER_ENDPOINT_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!url || !secret) throw new Error("Worker endpoint is not configured");
  return { url: url.replace(/\/$/, ""), secret };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, secret } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Worker ${path} responded ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function startStep(step: StepName, payload: StepPayload): Promise<string> {
  const { call_id } = await call<{ call_id: string }>(`/steps/${step}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return call_id;
}

export function pollCall(callId: string): Promise<CallStatus> {
  return call<CallStatus>(`/calls/${encodeURIComponent(callId)}`);
}
