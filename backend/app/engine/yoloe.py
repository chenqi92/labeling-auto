"""YOLOE-26（Ultralytics）开放词汇检测引擎，作为 LocateAnything 之外的可选检测后端。

与 LocateAnything 的差异：
- 极小、毫秒级；用文字 prompt 指定类别（`set_classes` + CLIP 文本编码）。
- **自带类别标签**——一次推理出所有类别并各自带正确 label，无需逐类跑。
- 直接返回**原图像素框 + 置信度**，不走 [0,1000] 归一化。
- 权重首次由 ultralytics 自动下载到 `settings.yoloe_weights_dir`。
"""
from __future__ import annotations

import os
import threading

from PIL import Image

from app.config import settings
from app.engine.base import Detection

# 可选 YOLOE 变体：引擎 key -> 权重文件名
YOLOE_VARIANTS: dict[str, str] = {
    "yoloe-26l": "yoloe-26l-seg.pt",
    "yoloe-26s": "yoloe-26s-seg.pt",
}


def is_yoloe(engine_key: str) -> bool:
    return engine_key in YOLOE_VARIANTS


class _YoloeModel:
    """单个 YOLOE 变体的懒加载封装。set_classes/predict 串行化（非线程安全）。"""

    def __init__(self, weights: str) -> None:
        self._weights = weights
        self._model = None
        self._lock = threading.Lock()

    def _ensure(self):
        if self._model is None:
            os.environ.setdefault("YOLO_CONFIG_DIR", settings.yoloe_config_dir)
            from ultralytics import YOLOE

            path = os.path.join(settings.yoloe_weights_dir, self._weights)
            self._model = YOLOE(path)
        return self._model

    def detect(self, image: Image.Image, classes: list[str], conf: float) -> list[Detection]:
        with self._lock:
            model = self._ensure()
            model.set_classes(classes, model.get_text_pe(classes))
            results = model.predict(image, conf=conf, verbose=False)
        out: list[Detection] = []
        if not results:
            return out
        boxes = getattr(results[0], "boxes", None)
        if boxes is None:
            return out
        for i in range(len(boxes)):
            cls_idx = int(boxes.cls[i])
            label = classes[cls_idx] if 0 <= cls_idx < len(classes) else "object"
            x1, y1, x2, y2 = (float(v) for v in boxes.xyxy[i].tolist())
            out.append(
                Detection(label=label, x1=x1, y1=y1, x2=x2, y2=y2, score=float(boxes.conf[i]))
            )
        return out

    def info(self) -> dict:
        return {"weights": self._weights, "loaded": self._model is not None}


_models: dict[str, _YoloeModel] = {}
_models_lock = threading.Lock()


def get(engine_key: str) -> _YoloeModel:
    weights = YOLOE_VARIANTS.get(engine_key)
    if weights is None:
        raise KeyError(f"未知 YOLOE 引擎：{engine_key}")
    with _models_lock:
        if engine_key not in _models:
            _models[engine_key] = _YoloeModel(weights)
        return _models[engine_key]
