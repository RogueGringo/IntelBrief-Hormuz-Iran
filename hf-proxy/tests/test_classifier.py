"""Tests for MotionClassifier k-NN and persistence."""
from __future__ import annotations

import shutil
import tempfile

import numpy as np
import pytest

from classifier import MotionClassifier


@pytest.fixture
def tmp_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d)


@pytest.fixture
def clf(tmp_dir):
    return MotionClassifier(tmp_dir)


def _random_emb(dim: int = 40) -> np.ndarray:
    return np.random.randn(dim)


class TestLabelManagement:
    def test_add(self, clf):
        clf.add_label("s1", "draw", _random_emb())
        assert len(clf.ids) == 1
        assert clf.labels[0] == "draw"

    def test_multiple(self, clf):
        clf.add_label("s1", "draw", _random_emb())
        clf.add_label("s2", "fade", _random_emb())
        clf.add_label("s3", "draw", _random_emb())
        assert clf.get_label_counts() == {"draw": 2, "fade": 1}

    def test_remove(self, clf):
        clf.add_label("s1", "draw", _random_emb())
        clf.add_label("s2", "fade", _random_emb())
        clf.remove_label("s1")
        assert len(clf.ids) == 1
        assert clf.ids[0] == "s2"

    def test_get_labels(self, clf):
        clf.add_label("s1", "fade", _random_emb())
        clf.add_label("s2", "draw", _random_emb())
        clf.add_label("s3", "fade", _random_emb())
        assert clf.get_labels() == ["draw", "fade"]

    def test_update(self, clf):
        emb = _random_emb()
        clf.add_label("s1", "draw", emb)
        clf.add_label("s1", "fade", emb)
        assert len(clf.ids) == 1
        assert clf.labels[0] == "fade"


class TestKNN:
    def test_predict_single(self, clf):
        emb = _random_emb()
        clf.add_label("s1", "draw", emb)
        result = clf.predict_knn(emb)
        assert result["label"] == "draw"
        assert result["confidence"] > 0.0
        assert result["method"] == "knn"

    def test_nearest_neighbor(self, clf):
        base = np.ones(40)
        clf.add_label("s1", "draw", base)
        clf.add_label("s2", "fade", -base)
        # Query close to base → should predict "draw"
        query = base + np.random.randn(40) * 0.01
        result = clf.predict_knn(query)
        assert result["label"] == "draw"

    def test_empty(self, clf):
        result = clf.predict_knn(_random_emb())
        assert result["label"] == "unknown"
        assert result["confidence"] == 0.0

    def test_alternatives(self, clf):
        base = np.ones(40)
        clf.add_label("s1", "draw", base)
        clf.add_label("s2", "fade", base * 0.9)
        result = clf.predict_knn(base)
        assert "alternatives" in result
        # With 2 labels, the non-winner should be in alternatives
        assert len(result["alternatives"]) > 0 or result["confidence"] == 1.0


class TestPersistence:
    def test_save_and_load(self, tmp_dir):
        clf1 = MotionClassifier(tmp_dir)
        emb1 = _random_emb()
        emb2 = _random_emb()
        clf1.add_label("s1", "draw", emb1)
        clf1.add_label("s2", "fade", emb2)

        clf2 = MotionClassifier(tmp_dir)
        assert clf2.ids == ["s1", "s2"]
        assert clf2.labels == ["draw", "fade"]
        assert len(clf2.embeddings) == 2
        np.testing.assert_array_almost_equal(clf2.embeddings[0], emb1)
        np.testing.assert_array_almost_equal(clf2.embeddings[1], emb2)
