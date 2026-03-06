"""Tests for MotionClassifier k-NN, MLP, and persistence."""
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


def _build_trainable_clf(tmp_dir: str) -> MotionClassifier:
    """Build a classifier with enough data to train MLP (2 classes, 12 each)."""
    clf = MotionClassifier(tmp_dir)
    np.random.seed(42)
    # Class A: centered at +1
    for i in range(12):
        emb = np.ones(40) + np.random.randn(40) * 0.1
        clf.add_label(f"a{i}", "draw", emb)
    # Class B: centered at -1
    for i in range(12):
        emb = -np.ones(40) + np.random.randn(40) * 0.1
        clf.add_label(f"b{i}", "fade", emb)
    return clf


class TestMLP:
    def test_can_train_requires_10(self, clf):
        """Need >= 10 in any class AND >= 2 classes."""
        # 0 examples
        assert clf.can_train_mlp() is False
        # 1 class, 10 examples
        for i in range(10):
            clf.add_label(f"s{i}", "draw", _random_emb())
        assert clf.can_train_mlp() is False
        # 2 classes, one with 10
        clf.add_label("x1", "fade", _random_emb())
        assert clf.can_train_mlp() is True

    def test_train_mlp(self, tmp_dir):
        clf = _build_trainable_clf(tmp_dir)
        result = clf.train_mlp()
        assert result["status"] == "trained"
        assert result["n_classes"] == 2
        assert result["accuracy"] > 0.5
        assert clf.mlp is not None

    def test_predict_uses_mlp(self, tmp_dir):
        clf = _build_trainable_clf(tmp_dir)
        clf.train_mlp()
        # Query close to class A center
        query = np.ones(40)
        result = clf.predict(query)
        assert result["method"] == "mlp"
        assert result["label"] == "draw"
        assert result["confidence"] > 0.5
        assert "alternatives" in result

    def test_mlp_save_load(self, tmp_dir):
        clf1 = _build_trainable_clf(tmp_dir)
        clf1.train_mlp()
        query = np.ones(40)
        result1 = clf1.predict(query)

        clf2 = MotionClassifier(tmp_dir)
        assert clf2.mlp is not None
        result2 = clf2.predict(query)
        assert result2["method"] == "mlp"
        assert result2["label"] == result1["label"]
        assert abs(result2["confidence"] - result1["confidence"]) < 1e-6
