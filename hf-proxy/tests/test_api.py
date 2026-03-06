"""Tests for FastAPI middle layer endpoints."""
import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health_endpoint(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestSwings:
    def test_list_swings_empty(self, client):
        resp = client.get("/api/swings")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_nonexistent_swing(self, client):
        resp = client.get("/api/swing/nonexistent")
        assert resp.status_code == 404


class TestSignals:
    def test_signals_endpoint(self, client):
        resp = client.get("/api/signals")
        assert resp.status_code == 200
        data = resp.json()
        assert "signals" in data
        assert len(data["signals"]) >= 20


class TestLLMStatus:
    def test_llm_status(self, client):
        resp = client.get("/api/llm/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "gpu_model" in data
        assert "cpu_model" in data
