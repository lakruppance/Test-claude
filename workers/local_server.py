"""Local worker server: same HTTP API as the Modal deployment (/steps, /calls, /health), running
steps in a thread pool on this machine. For local testing only.

Run: uvicorn local_server:app --host 0.0.0.0 --port 8787"""

from __future__ import annotations

import hmac
import os
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from clipper.steps import STEPS, run_step, validate_payload

os.environ.setdefault("CLIPPER_RUNTIME", "local")  # compute/storage costs are 0 locally

executor = ThreadPoolExecutor(max_workers=int(os.environ.get("LOCAL_WORKER_THREADS", "2")))
calls: dict[str, Future] = {}

app = FastAPI(title="clipper-local-worker", docs_url=None, redoc_url=None)


def authorize(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {os.environ['WORKER_SHARED_SECRET']}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/steps/{step}", dependencies=[Depends(authorize)])
def start_step(step: str, payload: dict[str, Any]) -> dict[str, str]:
    if step not in STEPS:
        raise HTTPException(status_code=404, detail="unknown step")
    problem = validate_payload(payload)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    call_id = f"local-{uuid.uuid4()}"
    calls[call_id] = executor.submit(run_step, step, payload)
    return {"call_id": call_id}


@app.get("/calls/{call_id}", dependencies=[Depends(authorize)])
def poll_call(call_id: str) -> dict[str, Any]:
    future = calls.get(call_id)
    if future is None:
        return {"status": "failed", "retryable": True, "code": "output_expired",
                "message": "Unknown call (worker restarted?)"}
    if not future.done():
        return {"status": "pending"}
    calls.pop(call_id, None)
    output = future.result()
    if output.get("ok"):
        return {"status": "succeeded", "result": output["result"]}
    return {"status": "failed", **{k: v for k, v in output.items() if k != "ok"}}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
