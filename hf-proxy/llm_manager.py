"""Dual-model LLM manager — GPU for real-time, CPU for batch."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ModelSlot:
    model_path: str
    model_name: str
    backend: str  # "gpu" or "cpu"
    n_ctx: int = 2048
    instance: Any = field(default=None, repr=False)


@dataclass
class LLMStatus:
    gpu_model: str | None
    cpu_model: str | None
    gpu_vram_used_bytes: int
    cpu_ram_used_bytes: int

    @property
    def gpu_loaded(self) -> bool:
        return self.gpu_model is not None

    @property
    def cpu_loaded(self) -> bool:
        return self.cpu_model is not None


class LLMManager:
    """Manages two model slots: GPU (always warm) and CPU (on demand)."""

    def __init__(self) -> None:
        self.gpu_slot: ModelSlot | None = None
        self.cpu_slot: ModelSlot | None = None
        self._gpu_lock = threading.Lock()
        self._cpu_lock = threading.Lock()

    def status(self) -> LLMStatus:
        return LLMStatus(
            gpu_model=self.gpu_slot.model_name if self.gpu_slot else None,
            cpu_model=self.cpu_slot.model_name if self.cpu_slot else None,
            gpu_vram_used_bytes=0,
            cpu_ram_used_bytes=0,
        )

    def load_gpu(self, model_path: str, model_name: str, n_ctx: int = 2048) -> None:
        with self._gpu_lock:
            if self.gpu_slot and self.gpu_slot.instance:
                del self.gpu_slot.instance
            try:
                from llama_cpp import Llama
                instance = Llama(
                    model_path=model_path,
                    n_ctx=n_ctx,
                    n_gpu_layers=-1,
                    verbose=False,
                )
            except ImportError:
                instance = None
            self.gpu_slot = ModelSlot(
                model_path=model_path,
                model_name=model_name,
                backend="gpu",
                n_ctx=n_ctx,
                instance=instance,
            )

    def load_cpu(self, model_path: str, model_name: str, n_ctx: int = 4096) -> None:
        with self._cpu_lock:
            if self.cpu_slot and self.cpu_slot.instance:
                del self.cpu_slot.instance
            try:
                from llama_cpp import Llama
                instance = Llama(
                    model_path=model_path,
                    n_ctx=n_ctx,
                    n_gpu_layers=0,
                    verbose=False,
                )
            except ImportError:
                instance = None
            self.cpu_slot = ModelSlot(
                model_path=model_path,
                model_name=model_name,
                backend="cpu",
                n_ctx=n_ctx,
                instance=instance,
            )

    def unload_gpu(self) -> None:
        with self._gpu_lock:
            if self.gpu_slot and self.gpu_slot.instance:
                del self.gpu_slot.instance
            self.gpu_slot = None

    def unload_cpu(self) -> None:
        with self._cpu_lock:
            if self.cpu_slot and self.cpu_slot.instance:
                del self.cpu_slot.instance
            self.cpu_slot = None

    def infer_gpu(self, prompt: str, max_tokens: int = 256) -> str:
        if not self.gpu_slot:
            raise RuntimeError("No GPU model loaded")
        with self._gpu_lock:
            if not self.gpu_slot.instance:
                return "(GPU model not available — llama-cpp not installed)"
            result = self.gpu_slot.instance(prompt, max_tokens=max_tokens)
            return result["choices"][0]["text"]

    def infer_cpu(self, prompt: str, max_tokens: int = 1024) -> str:
        if not self.cpu_slot:
            raise RuntimeError("No CPU model loaded")
        with self._cpu_lock:
            if not self.cpu_slot.instance:
                return "(CPU model not available — llama-cpp not installed)"
            result = self.cpu_slot.instance(prompt, max_tokens=max_tokens)
            return result["choices"][0]["text"]
