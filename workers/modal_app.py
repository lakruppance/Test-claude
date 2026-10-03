"""Modal deployment: one function per pipeline step plus a small authenticated HTTP API the
orchestrator (Trigger.dev) uses to start steps and poll their results.

Deploy: modal deploy modal_app.py --env <environment>
Secrets: a Modal secret named "clipper-secrets" holding the variables listed in .env.example
(Supabase, R2, AssemblyAI, Anthropic, WORKER_SHARED_SECRET)."""

from __future__ import annotations

import os
from typing import Any

import modal

FONT_BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins"
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "curl", "libgl1", "libglib2.0-0")
    .uv_pip_install(
        "anthropic==1.11.0",
        "assemblyai==1.6.1",
        "boto3>=1.35",
        "httpx>=0.27",
        "mediapipe==0.10.21",
        "numpy>=1.26,<2.2",
        "opencv-python-headless>=4.10",
        "pydantic>=2.7",
        "fastapi[standard]>=0.115",
    )
    .run_commands(
        "mkdir -p /assets/fonts /assets/models",
        *[
            f"curl -fsSL -o /assets/fonts/{name} {FONT_BASE}/{name}"
            for name in ("Poppins-ExtraBold.ttf", "Poppins-Bold.ttf", "Poppins-SemiBold.ttf",
                         "OFL.txt")
        ],
        f"curl -fsSL -o /assets/models/blaze_face_short_range.tflite {FACE_MODEL_URL}",
    )
    .add_local_python_source("clipper")
)

app = modal.App("clipper", image=image)
secrets = [modal.Secret.from_name("clipper-secrets")]

# Each function reserves the resources declared in clipper/steps.py (used for cost accounting).


@app.function(secrets=secrets, cpu=2.0, memory=4096, timeout=3600, ephemeral_disk=100 * 1024)
def prepare_step(payload: dict[str, Any]) -> dict[str, Any]:
    from clipper.steps import run_step

    return run_step("prepare", payload)


@app.function(secrets=secrets, cpu=0.25, memory=512, timeout=3 * 3600)
def transcribe_step(payload: dict[str, Any]) -> dict[str, Any]:
    from clipper.steps import run_step

    return run_step("transcribe", payload)


@app.function(secrets=secrets, cpu=0.25, memory=512, timeout=1800)
def detect_step(payload: dict[str, Any]) -> dict[str, Any]:
    from clipper.steps import run_step

    return run_step("detect", payload)


@app.function(secrets=secrets, cpu=4.0, memory=8192, timeout=3600, ephemeral_disk=100 * 1024)
def render_step(payload: dict[str, Any]) -> dict[str, Any]:
    from clipper.steps import run_step

    return run_step("render", payload)


STEPS = {
    "prepare": prepare_step,
    "transcribe": transcribe_step,
    "detect": detect_step,
    "render": render_step,
}


@app.function(secrets=secrets, cpu=0.25, memory=256)
@modal.asgi_app()
def api():
    import hmac

    from fastapi import Depends, FastAPI, Header, HTTPException

    web = FastAPI(title="clipper-worker", docs_url=None, redoc_url=None)

    def authorize(authorization: str = Header(default="")) -> None:
        expected = f"Bearer {os.environ['WORKER_SHARED_SECRET']}"
        if not hmac.compare_digest(authorization.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="unauthorized")

    @web.post("/steps/{step}", dependencies=[Depends(authorize)])
    def start_step(step: str, payload: dict[str, Any]) -> dict[str, str]:
        fn = STEPS.get(step)
        if fn is None:
            raise HTTPException(status_code=404, detail="unknown step")
        from clipper.steps import validate_payload

        problem = validate_payload(payload)
        if problem:
            raise HTTPException(status_code=422, detail=problem)
        call = fn.spawn(payload)
        return {"call_id": call.object_id}

    @web.get("/calls/{call_id}", dependencies=[Depends(authorize)])
    def poll_call(call_id: str) -> dict[str, Any]:
        try:
            output = modal.FunctionCall.from_id(call_id).get(timeout=0)
        except modal.exception.TimeoutError:
            return {"status": "pending"}
        except modal.exception.OutputExpiredError:
            return {"status": "failed", "retryable": True, "code": "output_expired",
                    "message": "Result expired before it was collected"}
        except Exception as exc:  # crash, timeout, OOM
            return {"status": "failed", "retryable": True, "code": "worker_crash",
                    "message": f"{type(exc).__name__}: {exc}"[:1000]}
        if output.get("ok"):
            return {"status": "succeeded", "result": output["result"]}
        return {"status": "failed", **{k: v for k, v in output.items() if k != "ok"}}

    @web.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return web
