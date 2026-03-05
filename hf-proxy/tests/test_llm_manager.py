"""Tests for dual-model LLM manager."""
import pytest
from llm_manager import LLMManager, LLMStatus, ModelSlot


class TestLLMManagerInit:
    def test_creates_with_defaults(self):
        mgr = LLMManager()
        assert mgr.gpu_slot is None
        assert mgr.cpu_slot is None

    def test_status_returns_no_models(self):
        mgr = LLMManager()
        status = mgr.status()
        assert status.gpu_model is None
        assert status.cpu_model is None
        assert status.gpu_vram_used_bytes == 0


class TestModelSlot:
    def test_slot_fields(self):
        slot = ModelSlot(
            model_path="/models/test.gguf",
            model_name="test-7b",
            backend="gpu",
            n_ctx=2048,
        )
        assert slot.model_name == "test-7b"
        assert slot.backend == "gpu"


class TestLLMStatus:
    def test_status_fields(self):
        status = LLMStatus(
            gpu_model=None,
            cpu_model=None,
            gpu_vram_used_bytes=0,
            cpu_ram_used_bytes=0,
        )
        assert not status.gpu_loaded
        assert not status.cpu_loaded

    def test_status_loaded(self):
        status = LLMStatus(
            gpu_model="test-7b",
            cpu_model="test-32b",
            gpu_vram_used_bytes=6500000000,
            cpu_ram_used_bytes=20000000000,
        )
        assert status.gpu_loaded
        assert status.cpu_loaded


class TestInference:
    def test_infer_gpu_raises_when_no_model(self):
        mgr = LLMManager()
        with pytest.raises(RuntimeError, match="No GPU model loaded"):
            mgr.infer_gpu("test prompt")

    def test_infer_cpu_raises_when_no_model(self):
        mgr = LLMManager()
        with pytest.raises(RuntimeError, match="No CPU model loaded"):
            mgr.infer_cpu("test prompt")
