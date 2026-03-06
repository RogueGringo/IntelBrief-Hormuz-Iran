"""User-trainable motion classifier with k-NN and MLP prediction."""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np


class MotionClassifier:
    """Classifies motion embeddings using k-NN (and optionally MLP)."""

    def __init__(self, data_dir: str) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.ids: list[str] = []
        self.labels: list[str] = []
        self.embeddings: list[np.ndarray] = []
        self.mlp: dict[str, Any] | None = None
        self.load()

    # ── Label management ────────────────────────────────────────────

    def add_label(self, session_id: str, label: str, embedding: np.ndarray) -> None:
        """Add or update a label for a session."""
        self.remove_label(session_id)
        self.ids.append(session_id)
        self.labels.append(label)
        self.embeddings.append(np.array(embedding, dtype=np.float64))
        self.save()

    def remove_label(self, session_id: str) -> None:
        """Remove a label by session_id (no-op if not found)."""
        if session_id in self.ids:
            idx = self.ids.index(session_id)
            self.ids.pop(idx)
            self.labels.pop(idx)
            self.embeddings.pop(idx)
            self.save()

    def get_label_counts(self) -> dict[str, int]:
        """Return count of examples per label."""
        return dict(Counter(self.labels))

    def get_labels(self) -> list[str]:
        """Return sorted list of unique labels."""
        return sorted(set(self.labels))

    # ── Prediction ──────────────────────────────────────────────────

    def predict(self, embedding: np.ndarray) -> dict[str, Any]:
        """Predict using MLP if trained, otherwise k-NN."""
        if self.mlp is not None:
            return self._predict_mlp(embedding)
        return self.predict_knn(embedding)

    def predict_knn(self, embedding: np.ndarray, k: int = 5) -> dict[str, Any]:
        """Predict label via cosine-similarity weighted k-NN vote."""
        if not self.embeddings:
            return {"label": "unknown", "confidence": 0.0, "method": "knn", "alternatives": {}}

        emb = np.array(embedding, dtype=np.float64)
        stack = np.array(self.embeddings)

        # Cosine similarity
        emb_norm = emb / (np.linalg.norm(emb) + 1e-12)
        stack_norms = stack / (np.linalg.norm(stack, axis=1, keepdims=True) + 1e-12)
        similarities = stack_norms @ emb_norm

        k_actual = min(k, len(self.embeddings))
        top_indices = np.argsort(similarities)[-k_actual:][::-1]

        # Weighted vote
        votes: dict[str, float] = {}
        for idx in top_indices:
            lbl = self.labels[idx]
            weight = max(similarities[idx], 0.0)
            votes[lbl] = votes.get(lbl, 0.0) + weight

        total = sum(votes.values())
        if total == 0:
            best = self.labels[top_indices[0]]
            return {"label": best, "confidence": 0.0, "method": "knn", "alternatives": {}}

        best = max(votes, key=votes.get)  # type: ignore[arg-type]
        confidence = votes[best] / total
        alternatives = {lbl: round(w / total, 4) for lbl, w in votes.items() if lbl != best}

        return {
            "label": best,
            "confidence": round(confidence, 4),
            "method": "knn",
            "alternatives": alternatives,
        }

    # ── Persistence ─────────────────────────────────────────────────

    def save(self) -> None:
        """Save index and embeddings to disk."""
        index = {
            "ids": self.ids,
            "labels": self.labels,
        }
        (self.data_dir / "index.json").write_text(json.dumps(index, indent=2))

        if self.embeddings:
            np.save(str(self.data_dir / "embeddings.npy"), np.array(self.embeddings))
        elif (self.data_dir / "embeddings.npy").exists():
            os.remove(self.data_dir / "embeddings.npy")

        if self.mlp is not None:
            self._save_mlp()

    def load(self) -> None:
        """Load index and embeddings from disk."""
        index_path = self.data_dir / "index.json"
        emb_path = self.data_dir / "embeddings.npy"

        if index_path.exists():
            index = json.loads(index_path.read_text())
            self.ids = index.get("ids", [])
            self.labels = index.get("labels", [])
        else:
            self.ids = []
            self.labels = []

        if emb_path.exists():
            arr = np.load(str(emb_path))
            self.embeddings = [arr[i] for i in range(len(arr))]
        else:
            self.embeddings = []

        mlp_path = self.data_dir / "mlp.json"
        if mlp_path.exists():
            self._load_mlp()

    # ── MLP (stubs — replaced in Task 3) ───────────────────────────

    def can_train_mlp(self) -> bool:
        """Check if we have enough data: any class >= 10 examples AND >= 2 classes."""
        counts = self.get_label_counts()
        if len(counts) < 2:
            return False
        return any(c >= 10 for c in counts.values())

    def train_mlp(self) -> dict[str, Any]:
        """Train MLP on labeled embeddings. Stub — implemented in Task 3."""
        return {"status": "not_implemented"}

    def _predict_mlp(self, embedding: np.ndarray) -> dict[str, Any]:
        """Forward pass through MLP. Stub — implemented in Task 3."""
        return self.predict_knn(embedding)

    def _save_mlp(self) -> None:
        """Save MLP weights. Stub — implemented in Task 3."""
        pass

    def _load_mlp(self) -> None:
        """Load MLP weights. Stub — implemented in Task 3."""
        pass
