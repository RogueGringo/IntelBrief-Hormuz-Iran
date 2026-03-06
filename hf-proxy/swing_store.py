"""File-based swing data store."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any


@dataclass
class SwingRecord:
    id: str
    filename: str
    ground_truth: dict[str, float] = field(default_factory=dict)
    features: dict[str, float] | None = None
    topology: dict[str, Any] | None = None
    classification: str | None = None
    classification_confidence: float = 0.0
    coaching_notes: str | None = None
    session_meta: dict[str, Any] | None = None
    status: str = "ingested"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SwingStore:
    def __init__(self, base_dir: str = "./swings") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, record: SwingRecord) -> str:
        path = self.base_dir / f"{record.id}.json"
        path.write_text(json.dumps(record.to_dict(), indent=2))
        return record.id

    def load(self, swing_id: str) -> SwingRecord | None:
        path = self.base_dir / f"{swing_id}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return SwingRecord(**data)

    def list_all(self) -> list[dict[str, Any]]:
        records = []
        for path in sorted(self.base_dir.glob("*.json")):
            data = json.loads(path.read_text())
            records.append({
                "id": data["id"],
                "filename": data["filename"],
                "status": data["status"],
                "classification": data.get("classification"),
            })
        return records

    def update(self, swing_id: str, **kwargs: Any) -> SwingRecord | None:
        record = self.load(swing_id)
        if not record:
            return None
        for key, value in kwargs.items():
            if hasattr(record, key):
                setattr(record, key, value)
        self.save(record)
        return record

    def create_id(self) -> str:
        return str(uuid.uuid4())[:8]
