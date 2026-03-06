# User-Trainable Topological Classifier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users label sessions and train a domain-agnostic motion classifier on sovereign-lib's 40D topological embeddings.

**Architecture:** Two-tier classifier (k-NN instant + MLP trained) stored as JSON/numpy in `data/classifiers/`. Labels live on SwingRecord. Four new API endpoints. Frontend gets label input on session cards and classifier panel in Model Registry.

**Tech Stack:** Python (numpy), FastAPI endpoints, React inline label UI, Recharts bar chart for label distribution.

---

### Task 1: Add `user_label` field to SwingRecord

**Files:**
- Modify: `hf-proxy/swing_store.py:12-25`
- Modify: `hf-proxy/swing_store.py:51-64`

**Step 1: Add field to SwingRecord dataclass**

In `hf-proxy/swing_store.py`, add `user_label` after the `group` field (line 25):

```python
    group: str | None = None
    user_label: str | None = None  # User-assigned motion class label
```

**Step 2: Add `user_label` to `list_all()` response**

In the `list_all` method, add `user_label` to the dict returned for each record:

```python
            records.append({
                "id": data["id"],
                "filename": data["filename"],
                "status": data["status"],
                "classification": data.get("classification"),
                "tags": data.get("tags", []),
                "notes": data.get("notes"),
                "group": data.get("group"),
                "user_label": data.get("user_label"),
            })
```

**Step 3: Verify existing tests still pass**

Run: `cd hf-proxy && python -m pytest tests/ -v`
Expected: All existing tests pass (backwards compatibility via known-fields filter in `load()`)

**Step 4: Commit**

```bash
git add hf-proxy/swing_store.py
git commit -m "feat: add user_label field to SwingRecord for trainable classifier"
```

---

### Task 2: Create MotionClassifier — k-NN core

**Files:**
- Create: `hf-proxy/classifier.py`
- Create: `hf-proxy/tests/test_classifier.py`

**Step 1: Write the failing tests**

Create `hf-proxy/tests/test_classifier.py`:

```python
"""Tests for MotionClassifier."""
import tempfile
import numpy as np
import pytest
from classifier import MotionClassifier


@pytest.fixture
def clf(tmp_path):
    return MotionClassifier(str(tmp_path / "classifiers"))


def _fake_embedding(seed=42, dim=40):
    rng = np.random.RandomState(seed)
    return rng.randn(dim).tolist()


class TestLabelManagement:
    def test_add_label(self, clf):
        emb = _fake_embedding(1)
        clf.add_label("s1", "golf_swing", emb)
        assert clf.get_label_counts() == {"golf_swing": 1}

    def test_add_multiple_labels(self, clf):
        clf.add_label("s1", "golf_swing", _fake_embedding(1))
        clf.add_label("s2", "golf_swing", _fake_embedding(2))
        clf.add_label("s3", "deadlift", _fake_embedding(3))
        assert clf.get_label_counts() == {"golf_swing": 2, "deadlift": 1}

    def test_remove_label(self, clf):
        clf.add_label("s1", "golf_swing", _fake_embedding(1))
        clf.remove_label("s1")
        assert clf.get_label_counts() == {}

    def test_get_labels(self, clf):
        clf.add_label("s1", "a", _fake_embedding(1))
        clf.add_label("s2", "b", _fake_embedding(2))
        assert sorted(clf.get_labels()) == ["a", "b"]

    def test_update_label(self, clf):
        clf.add_label("s1", "golf", _fake_embedding(1))
        clf.add_label("s1", "deadlift", _fake_embedding(1))
        assert clf.get_label_counts() == {"deadlift": 1}


class TestKNN:
    def test_predict_single_class(self, clf):
        clf.add_label("s1", "golf", _fake_embedding(1))
        result = clf.predict_knn(_fake_embedding(1))
        assert result["label"] == "golf"
        assert result["confidence"] > 0.5
        assert result["method"] == "knn"

    def test_predict_nearest_neighbor(self, clf):
        # Two classes with distinct embeddings
        emb_a = [1.0] * 20 + [0.0] * 20
        emb_b = [0.0] * 20 + [1.0] * 20
        clf.add_label("s1", "type_a", emb_a)
        clf.add_label("s2", "type_b", emb_b)
        # Query close to type_a
        query = [0.9] * 20 + [0.1] * 20
        result = clf.predict_knn(query)
        assert result["label"] == "type_a"

    def test_predict_empty_classifier(self, clf):
        result = clf.predict_knn(_fake_embedding(1))
        assert result["label"] is None
        assert result["confidence"] == 0.0

    def test_alternatives(self, clf):
        clf.add_label("s1", "a", [1.0] * 20 + [0.0] * 20)
        clf.add_label("s2", "b", [0.0] * 20 + [1.0] * 20)
        result = clf.predict_knn([0.8] * 20 + [0.2] * 20)
        assert "alternatives" in result
        assert len(result["alternatives"]) <= 3


class TestPersistence:
    def test_save_and_load(self, clf):
        clf.add_label("s1", "golf", _fake_embedding(1))
        clf.add_label("s2", "deadlift", _fake_embedding(2))
        clf.save()

        clf2 = MotionClassifier(clf.data_dir)
        clf2.load()
        assert clf2.get_label_counts() == {"golf": 1, "deadlift": 1}
        result = clf2.predict_knn(_fake_embedding(1))
        assert result["label"] == "golf"
```

**Step 2: Run tests to verify they fail**

Run: `cd hf-proxy && python -m pytest tests/test_classifier.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'classifier'`

**Step 3: Implement MotionClassifier k-NN core**

Create `hf-proxy/classifier.py`:

```python
"""Two-tier motion classifier: k-NN + optional MLP on topological embeddings."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


class MotionClassifier:
    """Classifies motion sessions using topological embeddings."""

    def __init__(self, data_dir: str) -> None:
        self.data_dir = data_dir
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        self._ids: list[str] = []
        self._labels: list[str] = []
        self._embeddings: list[list[float]] = []
        self._mlp: dict | None = None

    # ── Label Management ──────────────────────────────────────

    def add_label(self, session_id: str, label: str, embedding: list[float]) -> None:
        self.remove_label(session_id)
        self._ids.append(session_id)
        self._labels.append(label)
        self._embeddings.append(list(embedding))
        self.save()

    def remove_label(self, session_id: str) -> None:
        indices = [i for i, sid in enumerate(self._ids) if sid == session_id]
        for i in sorted(indices, reverse=True):
            self._ids.pop(i)
            self._labels.pop(i)
            self._embeddings.pop(i)
        if indices:
            self.save()

    def get_label_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for label in self._labels:
            counts[label] = counts.get(label, 0) + 1
        return counts

    def get_labels(self) -> list[str]:
        return sorted(set(self._labels))

    # ── k-NN Prediction ──────────────────────────────────────

    def predict_knn(self, embedding: list[float], k: int = 5) -> dict[str, Any]:
        if not self._embeddings:
            return {"label": None, "confidence": 0.0, "method": "knn", "alternatives": []}

        query = np.array(embedding, dtype=np.float64)
        matrix = np.array(self._embeddings, dtype=np.float64)

        # Cosine similarity
        query_norm = np.linalg.norm(query)
        if query_norm < 1e-10:
            return {"label": None, "confidence": 0.0, "method": "knn", "alternatives": []}
        norms = np.linalg.norm(matrix, axis=1)
        norms = np.maximum(norms, 1e-10)
        similarities = matrix @ query / (norms * query_norm)

        # Find top-k
        top_k = min(k, len(similarities))
        top_indices = np.argsort(similarities)[::-1][:top_k]

        # Weighted vote among top-k
        votes: dict[str, float] = {}
        for idx in top_indices:
            label = self._labels[idx]
            sim = float(similarities[idx])
            votes[label] = votes.get(label, 0.0) + max(sim, 0.0)

        if not votes:
            return {"label": None, "confidence": 0.0, "method": "knn", "alternatives": []}

        best_label = max(votes, key=votes.get)
        total_weight = sum(votes.values())
        confidence = votes[best_label] / total_weight if total_weight > 0 else 0.0

        alternatives = [
            {"label": lbl, "score": round(sc / total_weight, 4)}
            for lbl, sc in sorted(votes.items(), key=lambda x: -x[1])
        ][:3]

        return {
            "label": best_label,
            "confidence": round(float(confidence), 4),
            "method": "knn",
            "alternatives": alternatives,
        }

    def predict(self, embedding: list[float]) -> dict[str, Any]:
        if self._mlp:
            result = self._predict_mlp(embedding)
            if result["label"] is not None:
                return result
        return self.predict_knn(embedding)

    # ── Persistence ──────────────────────────────────────────

    def save(self) -> None:
        path = Path(self.data_dir)
        index = {
            "ids": self._ids,
            "labels": self._labels,
        }
        (path / "index.json").write_text(json.dumps(index, indent=2))
        if self._embeddings:
            np.save(str(path / "embeddings.npy"), np.array(self._embeddings))

    def load(self) -> None:
        path = Path(self.data_dir)
        index_path = path / "index.json"
        if not index_path.exists():
            return
        index = json.loads(index_path.read_text())
        self._ids = index.get("ids", [])
        self._labels = index.get("labels", [])
        emb_path = path / "embeddings.npy"
        if emb_path.exists():
            self._embeddings = np.load(str(emb_path)).tolist()
        else:
            self._embeddings = []

        # Load MLP if exists
        mlp_path = path / "mlp_meta.json"
        if mlp_path.exists():
            self._mlp = json.loads(mlp_path.read_text())
            weights_path = path / "mlp_weights.json"
            if weights_path.exists():
                self._mlp["weights"] = json.loads(weights_path.read_text())

    # ── MLP (placeholder for Task 3) ─────────────────────────

    def can_train_mlp(self) -> bool:
        counts = self.get_label_counts()
        return any(c >= 10 for c in counts.values()) and len(counts) >= 2

    def train_mlp(self) -> dict:
        raise NotImplementedError("MLP training — Task 3")

    def _predict_mlp(self, embedding: list[float]) -> dict:
        return {"label": None, "confidence": 0.0, "method": "mlp", "alternatives": []}
```

**Step 4: Run tests to verify they pass**

Run: `cd hf-proxy && python -m pytest tests/test_classifier.py -v`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add hf-proxy/classifier.py hf-proxy/tests/test_classifier.py
git commit -m "feat: MotionClassifier with k-NN prediction and persistence"
```

---

### Task 3: Implement MLP training and prediction

**Files:**
- Modify: `hf-proxy/classifier.py`
- Modify: `hf-proxy/tests/test_classifier.py`

**Step 1: Add MLP tests**

Add to `hf-proxy/tests/test_classifier.py`:

```python
class TestMLP:
    def test_can_train_requires_10_examples(self, clf):
        for i in range(9):
            clf.add_label(f"s{i}", "golf", _fake_embedding(i))
        clf.add_label("s9", "deadlift", _fake_embedding(99))
        assert not clf.can_train_mlp()  # golf has 9, deadlift has 1
        clf.add_label("s10", "golf", _fake_embedding(10))
        assert clf.can_train_mlp()  # golf has 10, 2 classes

    def test_train_mlp(self, clf):
        # Create two separable classes
        for i in range(15):
            clf.add_label(f"a{i}", "type_a", ([1.0 + i * 0.01] * 20 + [0.0] * 20))
            clf.add_label(f"b{i}", "type_b", ([0.0] * 20 + [1.0 + i * 0.01] * 20))
        result = clf.train_mlp()
        assert "accuracy" in result
        assert result["accuracy"] > 0.5
        assert "classes" in result

    def test_predict_uses_mlp_when_trained(self, clf):
        for i in range(15):
            clf.add_label(f"a{i}", "type_a", ([1.0 + i * 0.01] * 20 + [0.0] * 20))
            clf.add_label(f"b{i}", "type_b", ([0.0] * 20 + [1.0 + i * 0.01] * 20))
        clf.train_mlp()
        result = clf.predict([0.9] * 20 + [0.1] * 20)
        assert result["method"] == "mlp"
        assert result["label"] == "type_a"

    def test_mlp_save_load(self, clf):
        for i in range(15):
            clf.add_label(f"a{i}", "type_a", ([1.0 + i * 0.01] * 20 + [0.0] * 20))
            clf.add_label(f"b{i}", "type_b", ([0.0] * 20 + [1.0 + i * 0.01] * 20))
        clf.train_mlp()
        clf.save()

        clf2 = MotionClassifier(clf.data_dir)
        clf2.load()
        result = clf2.predict([0.9] * 20 + [0.1] * 20)
        assert result["method"] == "mlp"
        assert result["label"] == "type_a"
```

**Step 2: Run tests to verify MLP tests fail**

Run: `cd hf-proxy && python -m pytest tests/test_classifier.py::TestMLP -v`
Expected: FAIL — `NotImplementedError: MLP training — Task 3`

**Step 3: Implement MLP training and prediction**

Replace the MLP placeholder methods in `hf-proxy/classifier.py` with:

```python
    def train_mlp(self) -> dict:
        """Train a small MLP on labeled embeddings."""
        if not self.can_train_mlp():
            return {"error": "Need at least 2 classes and 10+ examples in one class"}

        X = np.array(self._embeddings, dtype=np.float64)
        classes = sorted(set(self._labels))
        class_to_idx = {c: i for i, c in enumerate(classes)}
        y = np.array([class_to_idx[l] for l in self._labels])
        n_classes = len(classes)

        # Normalize
        mean = X.mean(axis=0)
        std = X.std(axis=0) + 1e-8
        X_norm = (X - mean) / std

        # 80/20 split
        n = len(X_norm)
        perm = np.random.permutation(n)
        split = max(1, int(n * 0.8))
        X_train, X_val = X_norm[perm[:split]], X_norm[perm[split:]]
        y_train, y_val = y[perm[:split]], y[perm[split:]]

        # Init weights: 40→32→16→N
        np.random.seed(42)
        W1 = np.random.randn(X.shape[1], 32) * 0.1
        b1 = np.zeros(32)
        W2 = np.random.randn(32, 16) * 0.1
        b2 = np.zeros(16)
        W3 = np.random.randn(16, n_classes) * 0.1
        b3 = np.zeros(n_classes)

        lr = 0.01
        best_acc = 0.0
        patience = 20
        no_improve = 0

        def relu(x):
            return np.maximum(0, x)

        def softmax(x):
            e = np.exp(x - x.max(axis=1, keepdims=True))
            return e / e.sum(axis=1, keepdims=True)

        def forward(X_in):
            h1 = relu(X_in @ W1 + b1)
            h2 = relu(h1 @ W2 + b2)
            out = softmax(h2 @ W3 + b3)
            return h1, h2, out

        for epoch in range(200):
            # Forward
            h1, h2, probs = forward(X_train)

            # One-hot targets
            targets = np.zeros((len(y_train), n_classes))
            targets[np.arange(len(y_train)), y_train] = 1

            # Backward
            d3 = (probs - targets) / len(y_train)
            dW3 = h2.T @ d3
            db3 = d3.sum(axis=0)

            d2 = (d3 @ W3.T) * (h2 > 0)
            dW2 = h1.T @ d2
            db2 = d2.sum(axis=0)

            d1 = (d2 @ W2.T) * (h1 > 0)
            dW1 = X_train.T @ d1
            db1 = d1.sum(axis=0)

            W3 -= lr * dW3
            b3 -= lr * db3
            W2 -= lr * dW2
            b2 -= lr * db2
            W1 -= lr * dW1
            b1 -= lr * db1

            # Validation accuracy
            if len(X_val) > 0:
                _, _, val_probs = forward(X_val)
                val_acc = float((val_probs.argmax(axis=1) == y_val).mean())
                if val_acc > best_acc:
                    best_acc = val_acc
                    no_improve = 0
                else:
                    no_improve += 1
                if no_improve >= patience:
                    break

        # Final accuracy
        _, _, train_probs = forward(X_train)
        train_acc = float((train_probs.argmax(axis=1) == y_train).mean())
        val_acc = best_acc if len(X_val) > 0 else train_acc

        # Store MLP state
        from datetime import datetime, timezone
        self._mlp = {
            "classes": classes,
            "mean": mean.tolist(),
            "std": std.tolist(),
            "accuracy": round(val_acc, 4),
            "train_accuracy": round(train_acc, 4),
            "n_samples": n,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "weights": {
                "W1": W1.tolist(), "b1": b1.tolist(),
                "W2": W2.tolist(), "b2": b2.tolist(),
                "W3": W3.tolist(), "b3": b3.tolist(),
            },
        }
        self._save_mlp()
        return {
            "accuracy": round(val_acc, 4),
            "train_accuracy": round(train_acc, 4),
            "n_samples": n,
            "classes": classes,
        }

    def _save_mlp(self) -> None:
        if not self._mlp:
            return
        path = Path(self.data_dir)
        weights = self._mlp.pop("weights", None)
        (path / "mlp_meta.json").write_text(json.dumps(self._mlp, indent=2))
        if weights:
            (path / "mlp_weights.json").write_text(json.dumps(weights))
            self._mlp["weights"] = weights

    def _predict_mlp(self, embedding: list[float]) -> dict[str, Any]:
        if not self._mlp or "weights" not in self._mlp:
            return {"label": None, "confidence": 0.0, "method": "mlp", "alternatives": []}

        classes = self._mlp["classes"]
        mean = np.array(self._mlp["mean"])
        std = np.array(self._mlp["std"])
        w = self._mlp["weights"]

        x = (np.array(embedding) - mean) / std
        h1 = np.maximum(0, x @ np.array(w["W1"]) + np.array(w["b1"]))
        h2 = np.maximum(0, h1 @ np.array(w["W2"]) + np.array(w["b2"]))
        logits = h2 @ np.array(w["W3"]) + np.array(w["b3"])
        exp = np.exp(logits - logits.max())
        probs = exp / exp.sum()

        idx = int(probs.argmax())
        alternatives = [
            {"label": classes[i], "score": round(float(probs[i]), 4)}
            for i in np.argsort(probs)[::-1][:3]
        ]

        return {
            "label": classes[idx],
            "confidence": round(float(probs[idx]), 4),
            "method": "mlp",
            "alternatives": alternatives,
        }
```

**Step 4: Run tests to verify they pass**

Run: `cd hf-proxy && python -m pytest tests/test_classifier.py -v`
Expected: All 14 tests PASS

**Step 5: Commit**

```bash
git add hf-proxy/classifier.py hf-proxy/tests/test_classifier.py
git commit -m "feat: MLP training and prediction for MotionClassifier"
```

---

### Task 4: Add classifier API endpoints to FastAPI

**Files:**
- Modify: `hf-proxy/app.py`

**Step 1: Add classifier singleton and imports**

Near the top of `app.py`, after the `store` and `llm` singletons (around line 83):

```python
from classifier import MotionClassifier

motion_classifier = MotionClassifier(str(DATA_DIR / "classifiers"))
motion_classifier.load()
```

**Step 2: Add label endpoint**

After the PATCH endpoint for swings (around line 790), add:

```python
@app.put("/api/swing/{swing_id}/label")
async def set_label(swing_id: str, request: Request):
    """Set or update the user label for a session."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    body = await request.json()
    label = body.get("label", "").strip()
    if not label:
        return JSONResponse({"error": "Label cannot be empty"}, status_code=400)

    # Update record
    store.update(swing_id, user_label=label)

    # Add to classifier index
    embedding = (record.topology or {}).get("embedding", [])
    if embedding:
        motion_classifier.add_label(swing_id, label, embedding)

    # Re-predict with classifier
    reclassified = False
    if embedding:
        prediction = motion_classifier.predict(embedding)
        if prediction["label"]:
            store.update(
                swing_id,
                classification=prediction["label"],
                classification_confidence=prediction["confidence"],
            )
            reclassified = True

    return {"id": swing_id, "user_label": label, "reclassified": reclassified}


@app.delete("/api/swing/{swing_id}/label")
async def remove_label(swing_id: str):
    """Remove user label from a session."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    store.update(swing_id, user_label=None)
    motion_classifier.remove_label(swing_id)
    return {"id": swing_id, "user_label": None}
```

**Step 3: Add classifier status, train, and reclassify endpoints**

```python
@app.get("/api/classifier/status")
async def classifier_status():
    """Get classifier state: label counts, MLP status, accuracy."""
    counts = motion_classifier.get_label_counts()
    mlp = motion_classifier._mlp
    return {
        "total_labeled": sum(counts.values()),
        "classes": counts,
        "labels": motion_classifier.get_labels(),
        "mlp_trained": mlp is not None and "weights" in (mlp or {}),
        "mlp_accuracy": mlp.get("accuracy") if mlp else None,
        "mlp_trained_at": mlp.get("trained_at") if mlp else None,
        "can_train": motion_classifier.can_train_mlp(),
        "method": "mlp" if (mlp and "weights" in (mlp or {})) else "knn",
    }


@app.post("/api/classifier/train")
async def train_classifier():
    """Train MLP on labeled data."""
    if not motion_classifier.can_train_mlp():
        return JSONResponse(
            {"error": "Need at least 2 classes and 10+ examples in one class"},
            status_code=400,
        )
    result = motion_classifier.train_mlp()
    return result


@app.post("/api/classifier/reclassify")
async def reclassify_all():
    """Re-run classifier on all analyzed sessions with embeddings."""
    all_swings = store.list_all()
    updated = 0
    for summary in all_swings:
        record = store.load(summary["id"])
        if not record or record.status != "analyzed":
            continue
        embedding = (record.topology or {}).get("embedding", [])
        if not embedding:
            continue
        prediction = motion_classifier.predict(embedding)
        if prediction["label"]:
            store.update(
                summary["id"],
                classification=prediction["label"],
                classification_confidence=prediction["confidence"],
            )
            updated += 1
    return {"reclassified": updated, "total_analyzed": len(all_swings)}
```

**Step 4: Integrate classifier into analyze pipeline**

In the `analyze` endpoint (around line 700), after `cls_resp = await classify(swing_id)` and before `store.update(swing_id, status="analyzed")`, add:

```python
    # Step 4: user-trained classifier (overrides rule-based if available)
    record = store.load(swing_id)
    embedding = (record.topology or {}).get("embedding", []) if record else []
    if embedding and motion_classifier.get_label_counts():
        user_prediction = motion_classifier.predict(embedding)
        if user_prediction["label"]:
            store.update(
                swing_id,
                classification=user_prediction["label"],
                classification_confidence=user_prediction["confidence"],
            )
            steps.append({"step": "user_classifier", "result": user_prediction})
```

**Step 5: Verify backend starts**

Run: `cd hf-proxy && python -c "from app import app; print('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add hf-proxy/app.py
git commit -m "feat: classifier API endpoints — label, train, reclassify, auto-classify"
```

---

### Task 5: Add label UI to Session Feed cards

**Files:**
- Modify: `src/LiveFeedTab.jsx`
- Modify: `src/DataService.jsx`

**Step 1: Add fetchClassifierStatus to DataService**

In `src/DataService.jsx`, add before `getHealth`:

```javascript
export async function fetchClassifierStatus() {
  try {
    const resp = await fetch(`${API_BASE}/api/classifier/status`);
    if (!resp.ok) return { total_labeled: 0, classes: {}, labels: [] };
    return await resp.json();
  } catch (e) {
    return { total_labeled: 0, classes: {}, labels: [] };
  }
}
```

**Step 2: Add label input to session cards in LiveFeedTab**

In `src/LiveFeedTab.jsx`, add state for known labels at the top of the component (after other useState calls):

```javascript
const [knownLabels, setKnownLabels] = useState([]);

useEffect(() => {
  fetchClassifierStatus().then(data => {
    if (data.labels) setKnownLabels(data.labels);
  });
}, [swings]);
```

Add the import for `fetchClassifierStatus` from DataService.

Then in the session card, after the classification badge display and before the action buttons (around where `swing.classification` is shown), add a label input:

```jsx
{/* User Label */}
<div style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {swing.user_label ? (
      <span style={{
        fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
        background: `${COLORS.gold}20`, color: COLORS.gold,
        border: `1px solid ${COLORS.gold}40`, letterSpacing: 0.5,
      }}>
        {swing.user_label}
      </span>
    ) : null}
    <input
      list={`labels-${id}`}
      placeholder={swing.user_label ? 'Change label...' : 'Add label...'}
      defaultValue=""
      onKeyDown={async (e) => {
        if (e.key !== 'Enter') return;
        const val = e.target.value.trim();
        if (!val) return;
        await fetch(`/api/swing/${id}/label`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: val }),
        });
        e.target.value = '';
        addToast(`Labeled: ${val}`, 'success');
        loadSwings();
      }}
      style={{
        background: COLORS.bg, border: `1px solid ${COLORS.border}`,
        borderRadius: 4, color: COLORS.textDim, padding: '3px 8px',
        fontSize: 10, width: 120, outline: 'none',
      }}
    />
    <datalist id={`labels-${id}`}>
      {knownLabels.map(l => <option key={l} value={l} />)}
    </datalist>
  </div>
</div>
```

**Step 3: Build to verify**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/LiveFeedTab.jsx src/DataService.jsx
git commit -m "feat: label input on session cards with autocomplete from known labels"
```

---

### Task 6: Add Classifier section to Model Registry tab

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/DataService.jsx`

**Step 1: Add fetchClassifierStatus import to App.jsx**

Add `fetchClassifierStatus` to the import from DataService.

**Step 2: Add classifier state and UI to ModelRegistryTab**

Inside the `ModelRegistryTab` function, add state:

```javascript
const [classifierStatus, setClassifierStatus] = useState(null);
const [training, setTraining] = useState(false);
const [trainResult, setTrainResult] = useState(null);
const [reclassifying, setReclassifying] = useState(false);
```

In the `loadData` callback, add:

```javascript
const clsStatus = await fetchClassifierStatus();
setClassifierStatus(clsStatus);
```

Then add a CLASSIFIER section in the JSX (after the LLM slots section, before the closing `</div>`):

```jsx
{/* User-Trained Classifier */}
<div style={{
  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
  borderRadius: 8, padding: 20, marginBottom: 20,
  borderLeft: `3px solid ${COLORS.gold}`,
}}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold }}>
        MOTION CLASSIFIER
      </div>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
        {classifierStatus?.total_labeled || 0} labeled sessions &middot; Method: {classifierStatus?.method || 'none'}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        disabled={!classifierStatus?.can_train || training}
        onClick={async () => {
          setTraining(true);
          try {
            const resp = await fetch('/api/classifier/train', { method: 'POST' });
            const data = await resp.json();
            setTrainResult(data);
            loadData();
          } catch (e) {
            setTrainResult({ error: e.message });
          }
          setTraining(false);
        }}
        style={{
          padding: '6px 16px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          letterSpacing: 1, cursor: classifierStatus?.can_train ? 'pointer' : 'not-allowed',
          background: classifierStatus?.can_train ? COLORS.gold : COLORS.border,
          color: classifierStatus?.can_train ? COLORS.bg : COLORS.textMuted,
          border: 'none',
        }}
      >
        {training ? 'Training...' : 'Train MLP'}
      </button>
      <button
        onClick={async () => {
          setReclassifying(true);
          await fetch('/api/classifier/reclassify', { method: 'POST' });
          setReclassifying(false);
          loadData();
        }}
        disabled={reclassifying || !classifierStatus?.total_labeled}
        style={{
          padding: '6px 16px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          letterSpacing: 1, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${COLORS.border}`,
          color: COLORS.textDim,
        }}
      >
        {reclassifying ? 'Reclassifying...' : 'Reclassify All'}
      </button>
    </div>
  </div>

  {/* MLP Status */}
  {classifierStatus?.mlp_trained && (
    <div style={{
      display: 'flex', gap: 16, padding: '8px 12px', marginBottom: 12,
      background: `${COLORS.green}08`, borderRadius: 4, border: `1px solid ${COLORS.green}20`,
    }}>
      <span style={{ fontSize: 11, color: COLORS.green, fontWeight: 600 }}>
        MLP Accuracy: {((classifierStatus.mlp_accuracy || 0) * 100).toFixed(1)}%
      </span>
      <span style={{ fontSize: 10, color: COLORS.textDim }}>
        Trained: {classifierStatus.mlp_trained_at ? new Date(classifierStatus.mlp_trained_at).toLocaleString() : '—'}
      </span>
    </div>
  )}

  {trainResult && !trainResult.error && (
    <div style={{ fontSize: 10, color: COLORS.green, marginBottom: 8 }}>
      Trained on {trainResult.n_samples} samples — {trainResult.classes?.length} classes — {((trainResult.accuracy || 0) * 100).toFixed(1)}% accuracy
    </div>
  )}

  {/* Label Distribution */}
  {classifierStatus?.classes && Object.keys(classifierStatus.classes).length > 0 && (
    <div>
      <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
        LABEL DISTRIBUTION
      </div>
      {Object.entries(classifierStatus.classes)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => {
          const maxCount = Math.max(...Object.values(classifierStatus.classes));
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.text, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
              <div style={{ flex: 1, height: 14, background: COLORS.bg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${(count / maxCount) * 100}%`, height: '100%',
                  background: COLORS.gold, borderRadius: 2, transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 10, color: COLORS.textDim, width: 30, textAlign: 'right' }}>{count}</span>
            </div>
          );
        })}
    </div>
  )}

  {classifierStatus?.total_labeled === 0 && (
    <div style={{ fontSize: 11, color: COLORS.textDim, textAlign: 'center', padding: 12 }}>
      No labeled sessions yet. Add labels in SESSION FEED to train the classifier.
    </div>
  )}
</div>
```

**Step 3: Build to verify**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/App.jsx src/DataService.jsx
git commit -m "feat: classifier panel in Model Registry with train, reclassify, label distribution"
```

---

### Task 7: Update Progress tab and trends endpoint for user labels

**Files:**
- Modify: `hf-proxy/app.py` (trends endpoint)
- Modify: `src/ProgressTab.jsx`

**Step 1: Add user_label to trends response**

In the `/api/trends` endpoint in `app.py`, add `user_label` to the point dict:

```python
        points.append({
            ...
            "user_label": record.user_label,
            "tags": record.tags,
        })
```

**Step 2: Update classification distribution in ProgressTab**

In `src/ProgressTab.jsx`, update the `classDistribution` useMemo to prefer `user_label`:

```javascript
  const classDistribution = useMemo(() => {
    const counts = {};
    sessions.forEach(s => {
      const c = s.user_label || s.classification || "unclassified";
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count, pct: (count / sessions.length * 100).toFixed(0) }));
  }, [sessions]);
```

**Step 3: Build to verify**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add hf-proxy/app.py src/ProgressTab.jsx
git commit -m "feat: user labels in trends data and Progress tab classification distribution"
```

---

### Task 8: Update list_all and Session Feed to show user_label

**Files:**
- Modify: `src/LiveFeedTab.jsx`

**Step 1: Show user_label badge on session cards in collapsed view**

In the session card header (where classification badge is shown), add the user label display. Find where `swing.classification` badge is rendered and add above it:

```jsx
{swing.user_label && (
  <span style={{
    fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
    padding: '2px 8px', borderRadius: 10,
    background: `${COLORS.gold}20`, color: COLORS.gold,
    border: `1px solid ${COLORS.gold}30`,
  }}>
    {swing.user_label}
  </span>
)}
```

**Step 2: Build to verify**

Run: `npx vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/LiveFeedTab.jsx
git commit -m "feat: show user label badge on collapsed session cards"
```

---

### Task 9: Add SDK methods for classifier

**Files:**
- Modify: `sdk/sovereign_client.py`

**Step 1: Add classifier methods to SovereignClient**

After the `signals` method, add:

```python
    # ─── Classifier ───────────────────────────────────────────

    def set_label(self, session_id: str, label: str) -> dict:
        """Set a user label on a session for classifier training."""
        resp = self._session.put(
            self._url(f"/api/swing/{session_id}/label"),
            json={"label": label},
        )
        resp.raise_for_status()
        return resp.json()

    def remove_label(self, session_id: str) -> dict:
        """Remove user label from a session."""
        resp = self._session.delete(self._url(f"/api/swing/{session_id}/label"))
        resp.raise_for_status()
        return resp.json()

    def classifier_status(self) -> dict:
        """Get classifier state: label counts, MLP status."""
        return self._get("/api/classifier/status")

    def train_classifier(self) -> dict:
        """Train MLP on labeled data."""
        return self._post("/api/classifier/train")

    def reclassify_all(self) -> dict:
        """Re-run classifier on all analyzed sessions."""
        return self._post("/api/classifier/reclassify")
```

**Step 2: Commit**

```bash
git add sdk/sovereign_client.py
git commit -m "feat: classifier methods in Python SDK — label, train, reclassify"
```

---

### Task 10: Integration test and final verification

**Files:**
- Modify: `tests/test_api.py`

**Step 1: Add classifier API tests**

Add to `tests/test_api.py`:

```python
class TestClassifier:
    def test_status_empty(self, client):
        resp = client.get("/api/classifier/status")
        assert resp.status_code == 200
        assert resp.json()["total_labeled"] == 0

    def test_label_session(self, client, sample_csv):
        # Upload a session
        with open(sample_csv, "rb") as f:
            create = client.post(
                "/api/ingest",
                files={"file": ("label_test.csv", f, "text/csv")},
                data={"auto_analyze": "false"},
            )
        sid = create.json()["id"]

        # Label it
        resp = client.put(
            f"/api/swing/{sid}/label",
            json={"label": "test_motion"},
        )
        assert resp.status_code == 200
        assert resp.json()["user_label"] == "test_motion"

        # Check status
        status = client.get("/api/classifier/status")
        assert status.json()["total_labeled"] == 1
        assert "test_motion" in status.json()["classes"]

    def test_remove_label(self, client, sample_csv):
        with open(sample_csv, "rb") as f:
            create = client.post(
                "/api/ingest",
                files={"file": ("rm_test.csv", f, "text/csv")},
                data={"auto_analyze": "false"},
            )
        sid = create.json()["id"]
        client.put(f"/api/swing/{sid}/label", json={"label": "temp"})
        resp = client.delete(f"/api/swing/{sid}/label")
        assert resp.status_code == 200

    def test_train_requires_minimum_data(self, client):
        resp = client.post("/api/classifier/train")
        assert resp.status_code == 400
```

**Step 2: Run all tests**

Run: `cd hf-proxy && python -m pytest tests/ -v && cd .. && python -m pytest tests/ -v`
Expected: All tests pass

**Step 3: Run production build**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add tests/test_api.py
git commit -m "test: classifier API integration tests — label, status, train validation"
```

---
