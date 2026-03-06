# User-Trainable Topological Classifier — Design

## Goal

Let users define their own motion classes by labeling sessions. The classifier learns from sovereign-lib's 40D topological embeddings, making it domain-agnostic — works for golf swings, deadlifts, machine vibration, PT exercises, or any motion type.

## Architecture

Two-tier classifier operating on existing topological embeddings:

**Tier 1 — k-NN (instant, few-shot):** Cosine similarity against labeled embeddings. Works with 1 example per class. Default tier, always available.

**Tier 2 — MLP (trained, higher accuracy):** Small feedforward network (40→32→16→N classes). Activated when any class has 10+ labeled examples and user clicks "Train Model." Numpy-only, no PyTorch dependency.

The existing rule-based CLEAN/NOISY/MIXED classification moves to a `quality_label` concept — it no longer occupies the `classification` field. User labels become the primary classification.

## Data Flow

```
Upload CSV
  → sovereign-lib: extract 91 features + 40D embedding
  → classifier.predict(embedding):
      if MLP trained → MLP prediction + confidence
      else if labeled examples exist → k-NN prediction + confidence
      else → null (no classifier data yet)
  → write to SwingRecord.classification + classification_confidence
  → user can override via label UI → becomes training data
  → label stored in SwingRecord.user_label
```

## Data Model Changes

### SwingRecord (swing_store.py)

Add one field:

```python
user_label: str | None = None  # User-assigned motion class label
```

The existing `classification` field continues to hold the predicted class. `user_label` is the ground truth set by the user. When `user_label` is set, it overrides `classification` for display purposes.

### Classifier State (data/classifiers/)

```
data/classifiers/
  index.json          # {label: [embedding_id, ...], metadata}
  embeddings.npy      # numpy array of all labeled embeddings
  mlp_weights.json    # MLP layer weights (list of lists)
  mlp_meta.json       # {classes, accuracy, trained_at, n_samples}
```

## New Module: hf-proxy/classifier.py (~150 lines)

```python
class MotionClassifier:
    """Two-tier motion classifier: k-NN + optional MLP."""

    def __init__(self, data_dir: str)

    # Label management
    def add_label(self, session_id: str, label: str, embedding: list[float])
    def remove_label(self, session_id: str)
    def get_label_counts(self) -> dict[str, int]
    def get_labels(self) -> list[str]

    # Prediction
    def predict_knn(self, embedding: list[float], k: int = 5) -> dict
        # Returns: {label, confidence, distances, method: "knn"}
    def predict(self, embedding: list[float]) -> dict
        # Uses MLP if trained, falls back to k-NN
        # Returns: {label, confidence, method: "mlp"|"knn", alternatives: [...]}

    # Training
    def can_train_mlp(self) -> bool  # any class has 10+ examples
    def train_mlp(self) -> dict  # returns {accuracy, n_samples, classes}

    # Persistence
    def save(self)
    def load(self)
```

### k-NN Implementation

- Store embeddings as numpy array, labels as parallel list
- Cosine similarity: `dot(a, b) / (norm(a) * norm(b))`
- Confidence: similarity of best match, scaled to [0, 1]
- Return top-3 alternatives with distances

### MLP Implementation

- Architecture: 40 → 32 (ReLU) → 16 (ReLU) → N (softmax)
- Training: mini-batch gradient descent, numpy-only
- 80/20 train/val split, early stopping
- Weights stored as JSON-serializable lists
- ~50 lines of numpy forward/backward pass

## API Endpoints

### PUT /api/swing/{swing_id}/label

Set or update the user label for a session.

```json
// Request
{"label": "golf_swing"}

// Response
{"id": "abc123", "user_label": "golf_swing", "reclassified": true}
```

Side effects:
- Updates SwingRecord.user_label
- Adds embedding to classifier index
- Re-predicts classification for this session
- Fires webhook event "session.labeled"

### DELETE /api/swing/{swing_id}/label

Remove user label from a session.

### GET /api/classifier/status

```json
{
  "total_labeled": 45,
  "classes": {"golf_swing": 20, "deadlift": 15, "idle": 10},
  "mlp_trained": true,
  "mlp_accuracy": 0.92,
  "mlp_trained_at": "2026-03-06T...",
  "can_train": true,
  "method": "mlp"
}
```

### POST /api/classifier/train

Trigger MLP training. Returns accuracy and metadata.

```json
{
  "accuracy": 0.92,
  "n_samples": 45,
  "classes": ["golf_swing", "deadlift", "idle"],
  "confusion_matrix": [[18,1,1],[0,14,1],[0,0,10]],
  "training_time_s": 0.3
}
```

### POST /api/classifier/reclassify

Re-run classifier on all analyzed sessions. Useful after training MLP or adding labels.

## Frontend Changes

### Session Cards (LiveFeedTab.jsx)

Below the existing classification badge, add a label input:

- Inline text input with datalist of existing labels
- Shows current `user_label` if set, placeholder "Add label..." if not
- On blur/enter: PUT to `/api/swing/{id}/label`
- Visual distinction: user labels get a solid badge, predictions get a dashed border

### Model Registry Tab (App.jsx)

Add a "CLASSIFIER" section:

- Label distribution bar chart (horizontal bars, one per class)
- k-NN / MLP status indicator
- "Train Model" button (enabled when can_train is true)
- Accuracy display after training
- "Reclassify All" button to re-run predictions

### Progress Tab (ProgressTab.jsx)

- Add user_label to trend data
- Classification distribution chart uses user labels when available

## Auto-Classification on Ingest

In the analyze endpoint, after computing topology:

1. If classifier has any labeled data → predict class
2. Write prediction to `classification` field
3. Include `classification_method: "knn"|"mlp"` in response

This replaces the current keyword-based CLEAN/NOISY/MIXED logic, which moves to the quality check only.

## Migration

Existing sessions with `classification` of CLEAN/NOISY/MIXED:
- Keep as-is until user labels something
- Once classifier has data, new sessions get classifier predictions
- "Reclassify All" button lets users update old sessions

## Testing

- Unit tests for MotionClassifier (k-NN, MLP, save/load)
- API tests for label, train, predict, reclassify endpoints
- Edge cases: single class, empty classifier, embedding dimension mismatch

## Success Criteria

1. User can label a session with one click
2. Next similar session auto-classifies with that label
3. 10+ labels → MLP training → higher accuracy
4. Works for any motion type without code changes
5. Classifier state persists across restarts
