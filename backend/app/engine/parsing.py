"""解析模型输出的 <box> 标记。坐标为 [0,1000] 归一化整数。"""
from __future__ import annotations

import re

# 官方 worker 正则（逐字）：框 = <box><x1><y1><x2><y2></box>
_BOX_RE = re.compile(r"<box><(\d+)><(\d+)><(\d+)><(\d+)></box>")
# 点 = <box><x><y></box>
_POINT_RE = re.compile(r"<box><(\d+)><(\d+)></box>")


def parse_boxes(answer: str) -> list[tuple[int, int, int, int]]:
    """返回 [0,1000] 归一化整数框 (x1,y1,x2,y2)。"""
    out: list[tuple[int, int, int, int]] = []
    for m in _BOX_RE.finditer(answer or ""):
        x1, y1, x2, y2 = (int(g) for g in m.groups())
        if x2 < x1:
            x1, x2 = x2, x1
        if y2 < y1:
            y1, y2 = y2, y1
        out.append((x1, y1, x2, y2))
    return out


def parse_points(answer: str) -> list[tuple[int, int]]:
    """返回 [0,1000] 归一化整数点 (x,y)。需先剔除四元组框以免误匹配。"""
    # 把四坐标框先抹掉，剩下的才是纯点
    residual = _BOX_RE.sub("", answer or "")
    return [(int(m.group(1)), int(m.group(2))) for m in _POINT_RE.finditer(residual)]


def denorm_box(box: tuple[int, int, int, int], width: int, height: int) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = box
    return (
        x1 / 1000.0 * width,
        y1 / 1000.0 * height,
        x2 / 1000.0 * width,
        y2 / 1000.0 * height,
    )


def denorm_point(pt: tuple[int, int], width: int, height: int) -> tuple[float, float]:
    x, y = pt
    return (x / 1000.0 * width, y / 1000.0 * height)
