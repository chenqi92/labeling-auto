"""开发用假引擎：不加载模型，按 prompt 确定性地造几个框，便于无 GPU 时联调 UI。

通过 LA_MOCK=1 启用。
"""
from __future__ import annotations

import hashlib

from PIL import Image

from app.engine.base import DetectParams, LocateEngine


def _seed(text: str) -> int:
    return int(hashlib.sha1(text.encode("utf-8")).hexdigest(), 16)


class MockEngine(LocateEngine):
    name = "mock"

    def info(self) -> dict:
        return {"engine": "mock", "device": "cpu", "dtype": "-", "quantization": "-"}

    def run(self, image: Image.Image, question: str, params: DetectParams):
        s = _seed(question)
        n = 1 + (s % 3)  # 1~3 个框
        boxes = []
        for i in range(n):
            r = _seed(f"{question}-{i}")
            w = 120 + (r % 200)            # [0,1000] 空间的宽
            h = 120 + ((r >> 8) % 200)
            x1 = (r >> 16) % max(1, 1000 - w)
            y1 = (r >> 24) % max(1, 1000 - h)
            boxes.append((x1, y1, x1 + w, y1 + h))
        raw = "".join(f"<box><{b[0]}><{b[1]}><{b[2]}><{b[3]}></box>" for b in boxes)
        return boxes, raw

    def run_points(self, image: Image.Image, question: str, params: DetectParams):
        s = _seed(question)
        pts = [((s % 1000), ((s >> 10) % 1000))]
        raw = "".join(f"<box><{p[0]}><{p[1]}></box>" for p in pts)
        return pts, raw
