"""Tests for SwingStore — file-based session persistence."""
from __future__ import annotations

import tempfile

import pytest

from swing_store import SwingRecord, SwingStore


@pytest.fixture
def store(tmp_path):
    return SwingStore(str(tmp_path / "swings"))


class TestSwingRecord:
    def test_create_minimal(self):
        rec = SwingRecord(id="abc", filename="test.csv")
        assert rec.status == "ingested"
        assert rec.user_label is None
        assert rec.tags == []

    def test_to_dict(self):
        rec = SwingRecord(id="abc", filename="test.csv", classification="CLEAN")
        d = rec.to_dict()
        assert d["id"] == "abc"
        assert d["classification"] == "CLEAN"
        assert isinstance(d, dict)


class TestSwingStore:
    def test_save_and_load(self, store):
        rec = SwingRecord(id="s1", filename="cap.csv", status="ingested")
        store.save(rec)
        loaded = store.load("s1")
        assert loaded is not None
        assert loaded.id == "s1"
        assert loaded.filename == "cap.csv"

    def test_load_missing(self, store):
        assert store.load("nonexistent") is None

    def test_list_all_empty(self, store):
        assert store.list_all() == []

    def test_list_all(self, store):
        for i in range(3):
            store.save(SwingRecord(id=f"s{i}", filename=f"f{i}.csv"))
        result = store.list_all()
        assert len(result) == 3
        assert all("id" in r for r in result)

    def test_list_all_includes_user_label(self, store):
        store.save(SwingRecord(id="s1", filename="f.csv", user_label="golf"))
        result = store.list_all()
        assert result[0]["user_label"] == "golf"

    def test_update(self, store):
        store.save(SwingRecord(id="s1", filename="f.csv"))
        store.update("s1", status="analyzed", classification="CLEAN")
        loaded = store.load("s1")
        assert loaded.status == "analyzed"
        assert loaded.classification == "CLEAN"

    def test_update_missing(self, store):
        assert store.update("nope", status="x") is None

    def test_update_user_label(self, store):
        store.save(SwingRecord(id="s1", filename="f.csv"))
        store.update("s1", user_label="deadlift")
        loaded = store.load("s1")
        assert loaded.user_label == "deadlift"

    def test_create_id_unique(self, store):
        ids = {store.create_id() for _ in range(100)}
        assert len(ids) == 100

    def test_backwards_compat_extra_fields(self, store):
        """Loading a record with extra fields should not crash."""
        import json
        path = store.base_dir / "compat.json"
        path.write_text(json.dumps({
            "id": "compat", "filename": "f.csv", "status": "ingested",
            "future_field": "should be ignored",
        }))
        loaded = store.load("compat")
        assert loaded is not None
        assert loaded.id == "compat"
        assert not hasattr(loaded, "future_field")
