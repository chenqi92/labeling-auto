"""FastAPI 入口：图片上传 / 自动检测 / 模型状态 / YOLO 导出。"""
from __future__ import annotations

import logging
import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.engine.base import DetectParams
from app.engine.manager import manager
from app.engine import prompts
from app.engine.parsing import denorm_box, denorm_point
from app.schemas import (
    Box,
    DetectRequest,
    DetectResponse,
    ExportRequest,
    ImageMeta,
    ModelStatus,
)
from app.services.store import store
from app.services.yolo_export import build_yolo_zip

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("locate-anything")

app = FastAPI(title="labeling-auto", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 支持的任务（给前端下拉用）
TASKS = [
    {"key": "detection", "label": "目标检测（开放词汇）", "needs_query": True,
     "hint": "逗号分隔多个类别，如：person, car, dog"},
    {"key": "grounding", "label": "短语定位", "needs_query": True,
     "hint": "自然语言短语，如：the red car on the left"},
    {"key": "ocr", "label": "文字检测（OCR）", "needs_query": False,
     "hint": "检测图中所有文字框，无需输入"},
    {"key": "gui", "label": "GUI 元素定位", "needs_query": True,
     "hint": "界面元素描述，如：the submit button"},
    {"key": "point", "label": "指向（点）", "needs_query": True,
     "hint": "返回点，自动转为小框"},
]


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mock": settings.mock}


@app.get("/api/tasks")
def list_tasks() -> dict:
    return {"tasks": TASKS}


@app.get("/api/model/status", response_model=ModelStatus)
def model_status() -> ModelStatus:
    s = manager.status()
    return ModelStatus(
        state=s.get("state", "unloaded"),
        engine=s.get("engine", ""),
        device=s.get("device", ""),
        dtype=s.get("dtype", ""),
        quantization=s.get("quantization", ""),
        message=s.get("message", ""),
    )


@app.post("/api/model/load", response_model=ModelStatus)
def model_load() -> ModelStatus:
    manager.load_async()
    return model_status()


@app.post("/api/images", response_model=list[ImageMeta])
async def upload_images(files: list[UploadFile] = File(...)) -> list[ImageMeta]:
    out: list[ImageMeta] = []
    for f in files:
        data = await f.read()
        if not data:
            continue
        try:
            stored = store.add(f.filename or "image", data, f.content_type or "")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"无法读取图片 {f.filename}: {e}")
        out.append(
            ImageMeta(
                id=stored.id,
                filename=stored.filename,
                width=stored.width,
                height=stored.height,
                content_type=stored.content_type,
                url=f"/api/images/{stored.id}/file",
            )
        )
    if not out:
        raise HTTPException(status_code=400, detail="没有有效图片")
    return out


@app.get("/api/images", response_model=list[ImageMeta])
def list_images() -> list[ImageMeta]:
    """列出当前后端已存的所有图片（前端刷新后据此恢复图片列表）。"""
    return [
        ImageMeta(
            id=s.id,
            filename=s.filename,
            width=s.width,
            height=s.height,
            content_type=s.content_type,
            url=f"/api/images/{s.id}/file",
        )
        for s in store.all()
    ]


@app.get("/api/images/{image_id}/file")
def get_image(image_id: str) -> Response:
    stored = store.get(image_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    return Response(content=store.get_bytes(image_id), media_type=stored.content_type)


def _params(req: DetectRequest) -> DetectParams:
    return DetectParams(
        mode=req.mode or settings.generation_mode,
        max_new_tokens=req.max_new_tokens or settings.max_new_tokens,
        temperature=req.temperature if req.temperature is not None else settings.temperature,
        top_p=req.top_p if req.top_p is not None else settings.top_p,
        do_sample=req.do_sample if req.do_sample is not None else settings.do_sample,
    )


@app.post("/api/detect", response_model=DetectResponse)
def detect(req: DetectRequest) -> DetectResponse:
    stored = store.get(req.image_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="图片不存在")

    try:
        engine = manager.get()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"模型加载失败：{e}")

    image = store.get_pil(req.image_id)
    W, H = stored.width, stored.height
    params = _params(req)
    query = (req.query or "").strip()

    boxes: list[Box] = []
    raw_parts: list[str] = []
    t0 = time.perf_counter()

    try:
        if req.task == "detection":
            cats = [c.strip() for c in query.split(",") if c.strip()]
            if not cats:
                raise HTTPException(status_code=400, detail="目标检测需要至少一个类别")
            # 逐类检测，保证每个框带正确标签
            for cat in cats:
                norm, raw = engine.run(image, prompts.detection_prompt([cat]), params)
                raw_parts.append(f"[{cat}] {raw}")
                for b in norm:
                    x1, y1, x2, y2 = denorm_box(b, W, H)
                    boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, label=cat))

        elif req.task == "grounding":
            if not query:
                raise HTTPException(status_code=400, detail="短语定位需要输入短语")
            norm, raw = engine.run(image, prompts.grounding_prompt(query), params)
            raw_parts.append(raw)
            for b in norm:
                x1, y1, x2, y2 = denorm_box(b, W, H)
                boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, label=query))

        elif req.task == "ocr":
            norm, raw = engine.run(image, prompts.ocr_prompt(), params)
            raw_parts.append(raw)
            for b in norm:
                x1, y1, x2, y2 = denorm_box(b, W, H)
                boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, label="text"))

        elif req.task == "gui":
            if not query:
                raise HTTPException(status_code=400, detail="GUI 定位需要输入描述")
            norm, raw = engine.run(image, prompts.gui_prompt(query), params)
            raw_parts.append(raw)
            for b in norm:
                x1, y1, x2, y2 = denorm_box(b, W, H)
                boxes.append(Box(x1=x1, y1=y1, x2=x2, y2=y2, label=query))

        elif req.task == "point":
            if not query:
                raise HTTPException(status_code=400, detail="指向需要输入描述")
            pts, raw = engine.run_points(image, prompts.point_prompt(query), params)
            raw_parts.append(raw)
            side = 0.02 * min(W, H)  # 点转为 2% 边长的小框
            for p in pts:
                cx, cy = denorm_point(p, W, H)
                boxes.append(
                    Box(
                        x1=max(0.0, cx - side),
                        y1=max(0.0, cy - side),
                        x2=min(float(W), cx + side),
                        y2=min(float(H), cy + side),
                        label=query,
                    )
                )
        else:
            raise HTTPException(status_code=400, detail=f"未知任务：{req.task}")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("detect failed")
        raise HTTPException(status_code=500, detail=f"推理失败：{e}")

    elapsed = int((time.perf_counter() - t0) * 1000)
    return DetectResponse(image_id=req.image_id, boxes=boxes, raw="\n".join(raw_parts), elapsed_ms=elapsed)


@app.post("/api/export/yolo")
def export_yolo(req: ExportRequest) -> Response:
    if not req.classes:
        raise HTTPException(status_code=400, detail="缺少类别列表")
    if not req.items:
        raise HTTPException(status_code=400, detail="没有可导出的标注")
    # 图片必须仍在后端（否则会导出空数据集），缺失则报错而非静默跳过
    missing = [it.image_id for it in req.items if store.get(it.image_id) is None]
    if missing:
        raise HTTPException(
            status_code=410,
            detail=f"{len(missing)} 张图片已失效（后端可能已重启或清空），请重新上传后再导出",
        )
    data, filename = build_yolo_zip(req)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# —— 可选：生产模式下托管已构建的前端 ——
_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
