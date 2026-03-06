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

    # ── MLP ───────────────────────────────────────────────────────

    def can_train_mlp(self) -> bool:
        """Check if we have enough data: any class >= 10 examples AND >= 2 classes."""
        counts = self.get_label_counts()
        if len(counts) < 2:
            return False
        return any(c >= 10 for c in counts.values())

    @staticmethod
    def _relu(x: np.ndarray) -> np.ndarray:
        return np.maximum(0, x)

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return e / (np.sum(e, axis=-1, keepdims=True) + 1e-12)

    def train_mlp(self) -> dict[str, Any]:
        """Train a numpy MLP (40->32->16->N) with mini-batch SGD."""
        if not self.can_train_mlp():
            return {"status": "insufficient_data", "counts": self.get_label_counts()}

        unique_labels = self.get_labels()
        label_to_idx = {lbl: i for i, lbl in enumerate(unique_labels)}
        n_classes = len(unique_labels)

        X = np.array(self.embeddings)
        y = np.array([label_to_idx[lbl] for lbl in self.labels])
        n_samples, n_features = X.shape

        # Normalize
        mu = X.mean(axis=0)
        std = X.std(axis=0) + 1e-8
        X_norm = (X - mu) / std

        # 80/20 split (shuffled)
        indices = np.random.permutation(n_samples)
        split = max(1, int(n_samples * 0.8))
        train_idx, val_idx = indices[:split], indices[split:]
        X_train, y_train = X_norm[train_idx], y[train_idx]
        X_val, y_val = X_norm[val_idx], y[val_idx]

        # He initialization: 40->32->16->N
        def he_init(fan_in: int, fan_out: int) -> np.ndarray:
            return np.random.randn(fan_in, fan_out) * np.sqrt(2.0 / fan_in)

        W1 = he_init(n_features, 32)
        b1 = np.zeros(32)
        W2 = he_init(32, 16)
        b2 = np.zeros(16)
        W3 = he_init(16, n_classes)
        b3 = np.zeros(n_classes)

        lr = 0.01
        batch_size = min(32, split)
        best_val_loss = float("inf")
        patience = 20
        wait = 0
        best_weights = None

        for epoch in range(500):
            # Shuffle training data
            perm = np.random.permutation(len(X_train))
            X_train = X_train[perm]
            y_train = y_train[perm]

            # Mini-batch SGD
            for start in range(0, len(X_train), batch_size):
                end = min(start + batch_size, len(X_train))
                xb = X_train[start:end]
                yb = y_train[start:end]
                bs = end - start

                # Forward
                z1 = xb @ W1 + b1
                a1 = self._relu(z1)
                z2 = a1 @ W2 + b2
                a2 = self._relu(z2)
                z3 = a2 @ W3 + b3
                probs = self._softmax(z3)

                # One-hot targets
                targets = np.zeros((bs, n_classes))
                targets[np.arange(bs), yb] = 1.0

                # Backward (cross-entropy + softmax gradient)
                dz3 = (probs - targets) / bs
                dW3 = a2.T @ dz3
                db3 = dz3.sum(axis=0)

                da2 = dz3 @ W3.T
                dz2 = da2 * (z2 > 0).astype(float)
                dW2 = a1.T @ dz2
                db2 = dz2.sum(axis=0)

                da1 = dz2 @ W2.T
                dz1 = da1 * (z1 > 0).astype(float)
                dW1 = xb.T @ dz1
                db1 = dz1.sum(axis=0)

                # Update
                W1 -= lr * dW1
                b1 -= lr * db1
                W2 -= lr * dW2
                b2 -= lr * db2
                W3 -= lr * dW3
                b3 -= lr * db3

            # Validation loss (early stopping)
            if len(X_val) > 0:
                z1v = X_val @ W1 + b1
                a1v = self._relu(z1v)
                z2v = a1v @ W2 + b2
                a2v = self._relu(z2v)
                z3v = a2v @ W3 + b3
                probs_v = self._softmax(z3v)
                val_loss = -np.mean(np.log(probs_v[np.arange(len(y_val)), y_val] + 1e-12))

                if val_loss < best_val_loss - 1e-4:
                    best_val_loss = val_loss
                    wait = 0
                    best_weights = (W1.copy(), b1.copy(), W2.copy(), b2.copy(), W3.copy(), b3.copy())
                else:
                    wait += 1
                    if wait >= patience:
                        break
            else:
                best_weights = (W1.copy(), b1.copy(), W2.copy(), b2.copy(), W3.copy(), b3.copy())

        if best_weights is None:
            best_weights = (W1, b1, W2, b2, W3, b3)

        self.mlp = {
            "labels": unique_labels,
            "mu": mu.tolist(),
            "std": std.tolist(),
            "W1": best_weights[0].tolist(),
            "b1": best_weights[1].tolist(),
            "W2": best_weights[2].tolist(),
            "b2": best_weights[3].tolist(),
            "W3": best_weights[4].tolist(),
            "b3": best_weights[5].tolist(),
        }
        self._save_mlp()

        # Compute training accuracy
        z1 = X_norm @ best_weights[0] + best_weights[1]
        a1 = self._relu(z1)
        z2 = a1 @ best_weights[2] + best_weights[3]
        a2 = self._relu(z2)
        z3 = a2 @ best_weights[4] + best_weights[5]
        preds = np.argmax(z3, axis=1)
        accuracy = float(np.mean(preds == y))

        return {
            "status": "trained",
            "accuracy": round(accuracy, 4),
            "n_samples": n_samples,
            "n_classes": n_classes,
            "labels": unique_labels,
        }

    def _predict_mlp(self, embedding: np.ndarray) -> dict[str, Any]:
        """Forward pass through trained MLP."""
        if self.mlp is None:
            return self.predict_knn(embedding)

        emb = np.array(embedding, dtype=np.float64)
        mu = np.array(self.mlp["mu"])
        std = np.array(self.mlp["std"])
        x = (emb - mu) / std

        W1 = np.array(self.mlp["W1"])
        b1 = np.array(self.mlp["b1"])
        W2 = np.array(self.mlp["W2"])
        b2 = np.array(self.mlp["b2"])
        W3 = np.array(self.mlp["W3"])
        b3 = np.array(self.mlp["b3"])

        z1 = x @ W1 + b1
        a1 = self._relu(z1)
        z2 = a1 @ W2 + b2
        a2 = self._relu(z2)
        z3 = a2 @ W3 + b3
        probs = self._softmax(z3)

        labels = self.mlp["labels"]
        best_idx = int(np.argmax(probs))
        confidence = float(probs[best_idx])
        alternatives = {
            labels[i]: round(float(probs[i]), 4)
            for i in range(len(labels))
            if i != best_idx
        }

        return {
            "label": labels[best_idx],
            "confidence": round(confidence, 4),
            "method": "mlp",
            "alternatives": alternatives,
        }

    def _save_mlp(self) -> None:
        """Save MLP weights and metadata to JSON."""
        if self.mlp is None:
            return
        (self.data_dir / "mlp.json").write_text(json.dumps(self.mlp))

    def _load_mlp(self) -> None:
        """Load MLP weights and metadata from JSON."""
        mlp_path = self.data_dir / "mlp.json"
        if mlp_path.exists():
            self.mlp = json.loads(mlp_path.read_text())
        else:
            self.mlp = None
