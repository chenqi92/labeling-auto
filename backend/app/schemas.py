"""API 请求 / 响应模型。坐标统一使用「原图像素坐标」（不是归一化）。"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

TaskType = Literal["detection", "grounding", "ocr", "gui", "point", "inspect", "recognize"]
GenMode = Literal["slow", "hybrid", "fast"]


class ImageMeta(BaseModel):
    id: str
    filename: str
    width: int
    height: int
    content_type: str
    url: str  # 后端取图地址，前端 <img src> 用


class Box(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    label: str = ""
    score: Optional[float] = None


class DetectRequest(BaseModel):
    image_id: str
    # 检测目标描述：detection/grounding 用逗号分隔的类别或短语；ocr/gui 可留空
    query: str = ""
    task: TaskType = "detection"
    mode: Optional[GenMode] = None
    max_new_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    do_sample: Optional[bool] = None


class DetectResponse(BaseModel):
    image_id: str
    boxes: list[Box]
    raw: str = ""          # 模型原始输出（调试用）
    elapsed_ms: int = 0


# —— 状态检测 / 巡检（视觉问答）——
class InspectRequest(BaseModel):
    image_id: str
    # 一组是非判断问题；也可用 query 传一整串（按换行/分号/问号拆分）
    questions: list[str] = Field(default_factory=list)
    query: str = ""


class InspectAnswer(BaseModel):
    question: str
    answer: str = "不确定"   # 是 | 否 | 不确定
    detail: str = ""


class InspectResponse(BaseModel):
    image_id: str
    answers: list[InspectAnswer]
    model: str = ""
    raw: str = ""
    elapsed_ms: int = 0


# —— 文字识别（OCR，输出文字内容而非框）——
class RecognizeRequest(BaseModel):
    image_id: str


class RecognizeResponse(BaseModel):
    image_id: str
    text: str = ""
    model: str = ""
    elapsed_ms: int = 0


# —— 导出 ——
class ExportAnnotation(BaseModel):
    class_id: int
    x1: float
    y1: float
    x2: float
    y2: float


class ExportItem(BaseModel):
    image_id: str
    annotations: list[ExportAnnotation] = Field(default_factory=list)


class ExportRequest(BaseModel):
    dataset_name: str = "dataset"
    classes: list[str]
    items: list[ExportItem]
    # 训练集比例（0~1）；为 None 时全部放入 train
    train_ratio: Optional[float] = None


# —— 模型状态 ——
class ModelStatus(BaseModel):
    state: Literal["unloaded", "loading", "ready", "error"]
    engine: str = ""
    device: str = ""
    dtype: str = ""
    quantization: str = ""
    message: str = ""
