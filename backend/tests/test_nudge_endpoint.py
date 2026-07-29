"""Integration tests for POST /api/v1/internal/nudges/run (shared-secret auth).

Runs against a live stack (same style as test_admin_notifications.py). This file uses
docker-compose.test.yml's dedicated `tests` container (pytest-capable), distinct from
tests/test_nudge_service.py which runs standalone via `python tests/test_nudge_service.py`
against the dev backend container.
"""

import os

import httpx
import pytest


def _api_base() -> str:
    return os.environ.get("API_BASE", "http://backend:8000").rstrip("/")


def _url(path: str) -> str:
    return f"{_api_base()}{path}"


def _stack_up() -> bool:
    try:
        return httpx.get(_url("/health"), timeout=5).status_code == 200
    except Exception:
        return False


needs_stack = pytest.mark.skipif(not _stack_up(), reason="live backend stack not reachable")


@needs_stack
def test_wrong_key_returns_401():
    r = httpx.post(_url("/api/v1/internal/nudges/run"), headers={"X-Nudge-Key": "wrong"}, timeout=20)
    assert r.status_code == 401


@needs_stack
def test_correct_key_returns_200_with_summary():
    key = os.environ.get("NUDGE_RUN_KEY", "test-nudge-key-do-not-use-in-prod")
    r = httpx.post(_url("/api/v1/internal/nudges/run"), headers={"X-Nudge-Key": key}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("date", "scanned", "customer_nudges_sent", "customer_nudges_failed",
              "skipped_today", "our_side", "needs_followup", "digest_sent"):
        assert k in body
