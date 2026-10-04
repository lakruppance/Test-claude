"""Minimal Supabase (PostgREST) writer using the service role key. Workers only write rows for
the job they were given; ownership checks happen before a job is queued."""

from __future__ import annotations

import os
from typing import Any

import httpx


class Database:
    def __init__(self) -> None:
        url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self._client = httpx.Client(
            base_url=f"{url}/rest/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=30,
        )

    def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any],
               upsert_on: str | None = None) -> list[dict[str, Any]]:
        headers = {"Prefer": "return=representation"}
        params = {}
        if upsert_on:
            headers["Prefer"] += ",resolution=merge-duplicates"
            params["on_conflict"] = upsert_on
        response = self._client.post(f"/{table}", json=rows, headers=headers, params=params)
        response.raise_for_status()
        return response.json()

    def update(self, table: str, values: dict[str, Any], **filters: str) -> None:
        params = {k: f"eq.{v}" for k, v in filters.items()}
        self._client.patch(f"/{table}", json=values, params=params).raise_for_status()

    def delete(self, table: str, **filters: str) -> None:
        params = {k: f"eq.{v}" for k, v in filters.items()}
        self._client.delete(f"/{table}", params=params).raise_for_status()

    def select_one(self, table: str, **filters: str) -> dict[str, Any] | None:
        params = {k: f"eq.{v}" for k, v in filters.items()} | {"limit": "1"}
        response = self._client.get(f"/{table}", params=params)
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else None
