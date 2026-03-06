"""API integration tests for Sovereign Motion backend."""
import json
import os
import sys
import tempfile

import pytest

# Add hf-proxy to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "hf-proxy"))

from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a test client with isolated data directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        os.environ["SOVEREIGN_DATA_DIR"] = tmpdir
        # Re-import to pick up env var
        from app import app
        yield TestClient(app)


@pytest.fixture
def sample_csv(tmp_path):
    """Create a minimal valid CSV file."""
    csv_content = (
        "timestamp_us,accel_x_mg,accel_y_mg,accel_z_mg,gyro_x_mdps,gyro_y_mdps,gyro_z_mdps\n"
        "0,100,200,980,1000,2000,500\n"
        "2000,150,180,990,1100,1900,600\n"
        "4000,200,160,1000,1200,1800,700\n"
        "6000,250,140,1010,1300,1700,800\n"
        "8000,300,120,1020,1400,1600,900\n"
    )
    path = tmp_path / "test_capture.csv"
    path.write_text(csv_content)
    return path


class TestHealthEndpoints:
    def test_health(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "swings" in data
        assert "uptime_s" in data

    def test_version(self, client):
        resp = client.get("/api/version")
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == "1.0.0"
        assert "capabilities" in data


class TestIngest:
    def test_upload_valid_csv(self, client, sample_csv):
        with open(sample_csv, "rb") as f:
            resp = client.post(
                "/api/ingest",
                files={"file": ("test.csv", f, "text/csv")},
                data={"auto_analyze": "false"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["status"] == "ingested"
        assert data["preview"]["samples"] == 5

    def test_upload_invalid_csv(self, client, tmp_path):
        bad = tmp_path / "bad.csv"
        bad.write_text("col_a,col_b\n1,2\n")
        with open(bad, "rb") as f:
            resp = client.post(
                "/api/ingest",
                files={"file": ("bad.csv", f, "text/csv")},
            )
        assert resp.status_code == 400
        assert "missing required columns" in resp.json()["error"].lower()


class TestSessions:
    def test_list_empty(self, client):
        resp = client.get("/api/swings")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_crud_cycle(self, client, sample_csv):
        # Create
        with open(sample_csv, "rb") as f:
            create_resp = client.post(
                "/api/ingest",
                files={"file": ("cycle.csv", f, "text/csv")},
                data={"auto_analyze": "false"},
            )
        sid = create_resp.json()["id"]

        # Read
        read_resp = client.get(f"/api/swing/{sid}")
        assert read_resp.status_code == 200
        assert read_resp.json()["id"] == sid

        # Update
        patch_resp = client.patch(
            f"/api/swing/{sid}",
            json={"notes": "test note", "tags": ["test"]},
        )
        assert patch_resp.status_code == 200

        # Delete
        del_resp = client.delete(f"/api/swing/{sid}")
        assert del_resp.status_code == 200


class TestExport:
    def test_trends_empty(self, client):
        resp = client.get("/api/trends")
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data

    def test_anomalies_few_sessions(self, client):
        resp = client.get("/api/anomalies")
        assert resp.status_code == 200
        data = resp.json()
        assert "anomalies" in data


class TestSettings:
    def test_get_settings(self, client):
        resp = client.get("/api/settings")
        assert resp.status_code == 200

    def test_update_settings(self, client):
        resp = client.put(
            "/api/settings",
            json={"sensor": {"threshold_mg": 200}},
        )
        assert resp.status_code == 200
        assert resp.json()["settings"]["sensor"]["threshold_mg"] == 200
