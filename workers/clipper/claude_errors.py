"""Turns Claude API account problems into clear, non-retryable pipeline errors. Retrying a
refused key, an empty credit balance or a rejected request three times only wastes time."""

from __future__ import annotations

from typing import Any


class GuardedMessages:
    def __init__(self, inner: Any):
        self._inner = inner

    def create(self, **kwargs: Any) -> Any:
        import anthropic

        from .pipeline import PipelineError

        try:
            return self._inner.create(**kwargs)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise PipelineError("claude_auth_failed", f"Claude API key refused: {exc}") from exc
        except anthropic.NotFoundError as exc:
            raise PipelineError("claude_model_unavailable",
                                f"Claude model not found: {exc}") from exc
        except anthropic.BadRequestError as exc:
            if "credit" in str(exc).lower():
                raise PipelineError("claude_no_credit", f"Claude credit exhausted: {exc}") from exc
            raise PipelineError("claude_bad_request",
                                f"Claude rejected the request: {exc}") from exc
        # Rate limits, overload and network errors stay retryable (the SDK retries first).
