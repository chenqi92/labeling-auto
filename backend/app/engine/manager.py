"""模型懒加载与状态管理。服务秒启动，首次检测时才真正加载 ~6GB 权重。"""
from __future__ import annotations

import logging
import threading

from app.config import settings
from app.engine.base import LocateEngine

log = logging.getLogger("locate-anything")


class ModelManager:
    def __init__(self) -> None:
        self._engine: LocateEngine | None = None
        self._state: str = "unloaded"
        self._message: str = ""
        self._state_lock = threading.Lock()
        self._load_lock = threading.Lock()

        if settings.mock:
            from app.engine.mock import MockEngine

            self._engine = MockEngine()
            self._set("ready", "Mock 引擎已就绪（LA_MOCK=1）")

    def _set(self, state: str, message: str) -> None:
        with self._state_lock:
            self._state = state
            self._message = message

    @property
    def state(self) -> str:
        with self._state_lock:
            return self._state

    def status(self) -> dict:
        with self._state_lock:
            base = {"state": self._state, "message": self._message}
        info = self._engine.info() if self._engine is not None else {}
        return {**base, **info}

    def ensure_loaded(self) -> LocateEngine:
        if self._engine is not None and self.state == "ready":
            return self._engine
        with self._load_lock:
            if self._engine is not None and self.state == "ready":
                return self._engine
            self._set("loading", f"正在加载 {settings.model_id} ...")
            try:
                from app.engine.locate_anything import LocateAnythingEngine

                engine = LocateAnythingEngine()
                self._engine = engine
                self._set("ready", "模型已就绪")
                log.info("model loaded: %s", engine.info())
                return engine
            except Exception as e:  # noqa: BLE001
                log.exception("model load failed")
                self._set("error", f"{type(e).__name__}: {e}")
                raise

    def load_async(self) -> None:
        if self.state in ("loading", "ready"):
            return

        def _worker() -> None:
            try:
                self.ensure_loaded()
            except Exception:  # 状态已置为 error
                pass

        threading.Thread(target=_worker, name="model-loader", daemon=True).start()

    def get(self) -> LocateEngine:
        return self.ensure_loaded()

    def unload(self) -> None:
        """卸载模型并释放显存（与 VQA 模型错峰，避免 16GB 卡上同时常驻导致 OOM）。

        mock 引擎不卸载（无显存占用，且 LA_MOCK 下不应触发真实加载）。
        """
        with self._load_lock:
            eng = self._engine
            if eng is None or settings.mock:
                return
            self._engine = None
            self._set("unloaded", "已卸载以释放显存给 VQA")
        try:
            import gc

            import torch

            del eng
            gc.collect()
            torch.cuda.empty_cache()
            log.info("LocateAnything 已卸载，显存已释放")
        except Exception:  # noqa: BLE001
            pass


manager = ModelManager()
