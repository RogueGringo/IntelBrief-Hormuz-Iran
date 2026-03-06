"""
Sovereign Motion — Python SDK Client

Programmatic access to the Sovereign Motion API for data science workflows.

Usage:
    from sovereign_client import SovereignClient

    client = SovereignClient("http://localhost:8000")

    # Upload and analyze
    session = client.upload("capture.csv")
    result = client.analyze(session["id"])

    # Get trends
    trends = client.trends()

    # Export all data
    df = client.export_dataframe()  # requires pandas
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests


class SovereignClient:
    """Client for the Sovereign Motion API."""

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _get(self, path: str, **kwargs: Any) -> Any:
        resp = self._session.get(self._url(path), **kwargs)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, **kwargs: Any) -> Any:
        resp = self._session.post(self._url(path), **kwargs)
        resp.raise_for_status()
        return resp.json()

    # ─── Health ───────────────────────────────────────────

    def health(self) -> dict:
        """Check backend health."""
        return self._get("/api/health")

    def stats(self) -> dict:
        """Get aggregate statistics."""
        return self._get("/api/stats")

    # ─── Sessions ─────────────────────────────────────────

    def list_sessions(self) -> list[dict]:
        """List all sessions."""
        return self._get("/api/swings")

    def get_session(self, session_id: str) -> dict:
        """Get full session data."""
        return self._get(f"/api/swing/{session_id}")

    def upload(self, csv_path: str, ground_truth: dict | None = None) -> dict:
        """Upload a CSV file for processing."""
        path = Path(csv_path)
        files = {"file": (path.name, open(path, "rb"), "text/csv")}
        data = {}
        if ground_truth:
            data["ground_truth"] = json.dumps(ground_truth)
        resp = self._session.post(self._url("/api/ingest"), files=files, data=data)
        resp.raise_for_status()
        return resp.json()

    def analyze(self, session_id: str) -> dict:
        """Run full analysis pipeline on a session."""
        return self._post(f"/api/analyze/{session_id}")

    def coach(self, session_id: str) -> dict:
        """Generate coaching notes for a session."""
        return self._post(f"/api/coach/{session_id}")

    def delete_session(self, session_id: str) -> dict:
        """Delete a session."""
        resp = self._session.delete(self._url(f"/api/swing/{session_id}"))
        resp.raise_for_status()
        return resp.json()

    def update_session(self, session_id: str, **kwargs: Any) -> dict:
        """Update session metadata (notes, tags, group)."""
        resp = self._session.patch(
            self._url(f"/api/swing/{session_id}"),
            json=kwargs,
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Analysis ─────────────────────────────────────────

    def quality(self, session_id: str) -> dict:
        """Run data quality check on a session."""
        return self._get(f"/api/swing/{session_id}/quality")

    def report(self, session_id: str) -> dict:
        """Get comprehensive analysis report."""
        return self._get(f"/api/swing/{session_id}/report")

    def compare(self, session_a: str, session_b: str) -> dict:
        """Compare two sessions."""
        return self._get(f"/api/compare?a={session_a}&b={session_b}")

    def get_data(self, session_id: str, downsample: int = 1) -> dict:
        """Get raw time-series data for charting."""
        return self._get(f"/api/swing/{session_id}/data?downsample={downsample}")

    # ─── Trends & Export ──────────────────────────────────

    def trends(self) -> dict:
        """Get per-session trend data."""
        return self._get("/api/trends")

    def export_csv(self, output_path: str | None = None) -> str:
        """Download CSV export. Returns CSV text or saves to file."""
        resp = self._session.get(self._url("/api/export/csv"))
        resp.raise_for_status()
        if output_path:
            Path(output_path).write_text(resp.text)
            return output_path
        return resp.text

    def export_dataframe(self):
        """Export all sessions as a pandas DataFrame. Requires pandas."""
        import io
        import pandas as pd
        csv_text = self.export_csv()
        return pd.read_csv(io.StringIO(csv_text))

    # ─── Groups ───────────────────────────────────────────

    def groups(self) -> dict:
        """List all workout groups."""
        return self._get("/api/groups")

    # ─── Settings ─────────────────────────────────────────

    def get_settings(self) -> dict:
        """Get current settings."""
        return self._get("/api/settings")

    def update_settings(self, **kwargs: Any) -> dict:
        """Update settings."""
        resp = self._session.put(self._url("/api/settings"), json=kwargs)
        resp.raise_for_status()
        return resp.json()

    # ─── Signals ──────────────────────────────────────────

    def signals(self) -> dict:
        """Get motion quality signals."""
        return self._get("/api/signals")

    # ─── Batch ────────────────────────────────────────────

    def batch_analyze(self) -> list[dict]:
        """Analyze all unprocessed sessions."""
        return self._post("/api/batch")

    def upload_and_analyze(self, csv_path: str, **kwargs: Any) -> dict:
        """Upload a CSV and immediately analyze it."""
        session = self.upload(csv_path, **kwargs)
        session_id = session.get("id") or session.get("swing_id")
        if session_id:
            result = self.analyze(session_id)
            return {**session, "analysis": result}
        return session
