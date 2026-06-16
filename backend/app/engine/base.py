"""引擎抽象层：所有实现都把模型输出归一化为「原图像素坐标」的 Detection 列表。"""
from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Optional

from PIL import Image


@dataclass
class Detection:
    """一个检测框，坐标为原图像素坐标（左上 x1,y1 → 右下 x2,y2）。"""
    label: str
    x1: float
    y1: float
    x2: float
    y2: float
    score: Optional[float] = None


@dataclass
class DetectParams:
    mode: str = "slow"            # slow | hybrid | fast
    max_new_tokens: int = 1024
    temperature: float = 0.7
    top_p: float = 0.9
    do_sample: bool = True


class LocateEngine(abc.ABC):
    """LocateAnything 推理引擎接口。"""

    name: str = "base"

    @abc.abstractmethod
    def info(self) -> dict:
        """返回引擎/设备/量化等状态信息。"""

    @abc.abstractmethod
    def run(self, image: Image.Image, question: str, params: DetectParams) -> tuple[list[tuple[int, int, int, int]], str]:
        """对单条 prompt 跑一次推理。

        返回 (boxes_norm, raw_text)：
        - boxes_norm: 模型原始 [0,1000] 归一化整数框列表 (x1,y1,x2,y2)
        - raw_text:   模型原始输出字符串（调试用）
        """

    @abc.abstractmethod
    def run_points(self, image: Image.Image, question: str, params: DetectParams) -> tuple[list[tuple[int, int]], str]:
        """pointing 任务：返回 [0,1000] 归一化整数点列表 (x,y) 与原始文本。"""
