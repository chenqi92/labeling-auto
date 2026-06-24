"""FastAPI 入口：图片上传 / 自动检测 / 模型状态 / YOLO 导出。"""
from __future__ import annotations

import logging
import os
import re
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app import auth, db
from app.config import settings
from app.engine.base import DetectParams
from app.engine.manager import manager
from app.engine import prompts, vqa, yoloe
from app.engine.parsing import denorm_box, denorm_point
from app.schemas import (
    Box,
    DetectRequest,
    DetectResponse,
    ExportRequest,
    ImageMeta,
    InspectAnswer,
    InspectRequest,
    InspectResponse,
    ModelStatus,
    RecognizeRequest,
    RecognizeResponse,
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


@app.on_event("startup")
def _startup() -> None:
    db.init_db()  # 建表 + 播种管理员（幂等）


# 账户 / 会话 / 用户管理
app.include_router(auth.router)
# 项目 / 图片 / 类别 / 标注 / 数据集版本
from app import projects  # noqa: E402
app.include_router(projects.router)
# 分割 / 抠图 / 元素拆解
from app import segment  # noqa: E402
app.include_router(segment.router)
# 模型管理 / 显存 / 资源监控
from app import registry  # noqa: E402
app.include_router(registry.router)
# 任务中心 / 批量 / 训练
from app import jobs  # noqa: E402
app.include_router(jobs.router)
# 系统设置 / 项目导出
from app import misc  # noqa: E402
app.include_router(misc.router)

# 支持的任务（给前端下拉用）
TASKS = [
    {"key": "detection", "label": "目标检测（开放词汇）", "needs_query": True,
     "hint": "空格或逗号分隔多个类别，如：人 头盔 person"},
    {"key": "grounding", "label": "短语定位", "needs_query": True,
     "hint": "自然语言短语，如：the red car on the left"},
    {"key": "ocr", "label": "文字检测（定位框）", "needs_query": False,
     "hint": "只框出文字位置、不识别内容（要识别文字请用「文字识别」）"},
    {"key": "gui", "label": "GUI 元素定位", "needs_query": True,
     "hint": "界面元素描述，如：the submit button"},
    {"key": "point", "label": "指向（点）", "needs_query": True,
     "hint": "返回点，自动转为小框"},
    {"key": "inspect", "label": "状态检测 / 巡检（VQA）", "needs_query": True,
     "hint": "问是非判断题，多个用问号或换行分隔，如：航标是否损坏？航标灯是否正常竖立？"},
    {"key": "recognize", "label": "文字识别（OCR）", "needs_query": False,
     "hint": "用视觉模型识别图中文字内容，输出文本，无需输入"},
]


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mock": settings.mock}


@app.get("/api/tasks")
def list_tasks() -> dict:
    return {"tasks": TASKS}


# 可选检测引擎（给前端引擎选择器用）。tasks = 该引擎支持的任务 key。
DETECT_ENGINES = [
    {"key": "la", "label": "LocateAnything-3B（精度高，较慢）",
     "tasks": ["detection", "grounding", "ocr", "gui", "point", "inspect", "recognize"]},
    {"key": "yoloe-26l", "label": "YOLOE-26-L（开放词汇，快）", "tasks": ["detection"]},
    {"key": "yoloe-26s", "label": "YOLOE-26-S（最快）", "tasks": ["detection"]},
]


@app.get("/api/engines")
def list_engines() -> dict:
    return {"engines": DETECT_ENGINES}


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

    image = store.get_pil(req.image_id)
    W, H = stored.width, stored.height
    query = (req.query or "").strip()
    engine_key = (req.engine or "la").strip()

    # —— YOLOE-26 引擎：开放词汇检测，自带类别标签，直接返回像素框 ——
    if yoloe.is_yoloe(engine_key):
        if req.task != "detection":
            raise HTTPException(status_code=400, detail="YOLOE 引擎仅支持「目标检测」任务")
        cats = [c.strip() for c in re.split(r"[，,、]", query) if c.strip()]
        if not cats:
            raise HTTPException(status_code=400, detail="目标检测需要至少一个类别")
        t0 = time.perf_counter()
        try:
            dets = yoloe.get(engine_key).detect(image, cats, settings.yoloe_conf)
        except Exception as e:  # noqa: BLE001
            log.exception("yoloe detect failed")
            raise HTTPException(status_code=500, detail=f"YOLOE 推理失败：{e}")
        boxes = [
            Box(x1=d.x1, y1=d.y1, x2=d.x2, y2=d.y2, label=d.label or "object", score=d.score)
            for d in dets
        ]
        elapsed = int((time.perf_counter() - t0) * 1000)
        return DetectResponse(
            image_id=req.image_id, boxes=boxes,
            raw=f"yoloe[{engine_key}] {len(boxes)} boxes", elapsed_ms=elapsed,
        )

    # —— LocateAnything 引擎 ——
    # 互斥：检测前先卸载可能占用显存的 VQA 模型，避免 16GB 卡上与 LocateAnything 争用 OOM
    if settings.vqa_exclusive:
        vqa.unload()

    try:
        engine = manager.get()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"模型加载失败：{e}")

    params = _params(req)

    boxes: list[Box] = []
    raw_parts: list[str] = []
    t0 = time.perf_counter()

    try:
        if req.task == "detection":
            # 兼容半/全角逗号、顿号分隔（前端标签输入已规范化，这里再兜底一次）
            cats = [c.strip() for c in re.split(r"[，,、]", query) if c.strip()]
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


def _split_questions(req: InspectRequest) -> list[str]:
    """问题来源：优先 questions 列表；否则把 query 按换行/分号/问号拆成多条。"""
    if req.questions:
        return [q.strip() for q in req.questions if q.strip()]
    parts = re.split(r"[\n;；?？]+", req.query or "")
    return [p.strip() for p in parts if p.strip()]


@app.get("/api/inspect/health")
def inspect_health() -> dict:
    """前端可据此提示「Ollama 未启动 / 视觉模型未拉取」。"""
    h = vqa.health()
    return {**h, "model": settings.vqa_model}


@app.post("/api/inspect", response_model=InspectResponse)
def inspect(req: InspectRequest) -> InspectResponse:
    stored = store.get(req.image_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    questions = _split_questions(req)
    if not questions:
        raise HTTPException(status_code=400, detail="请至少输入一个判断问题")

    # 互斥：VQA 前先卸载 LocateAnything 释放显存
    if settings.vqa_exclusive:
        manager.unload()

    image_bytes = store.get_bytes(req.image_id)
    t0 = time.perf_counter()
    try:
        answers, raw = vqa.inspect(image_bytes, questions)
    except vqa.VQAError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("inspect failed")
        raise HTTPException(status_code=500, detail=f"巡检推理失败：{e}")

    elapsed = int((time.perf_counter() - t0) * 1000)
    return InspectResponse(
        image_id=req.image_id,
        answers=[InspectAnswer(**a) for a in answers],
        model=settings.vqa_model,
        raw=raw,
        elapsed_ms=elapsed,
    )


@app.post("/api/recognize", response_model=RecognizeResponse)
def recognize(req: RecognizeRequest) -> RecognizeResponse:
    stored = store.get(req.image_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="图片不存在")

    # 互斥：VQA 前先卸载 LocateAnything 释放显存
    if settings.vqa_exclusive:
        manager.unload()

    image_bytes = store.get_bytes(req.image_id)
    t0 = time.perf_counter()
    try:
        text, _raw = vqa.recognize_text(image_bytes)
    except vqa.VQAError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("recognize failed")
        raise HTTPException(status_code=500, detail=f"文字识别失败：{e}")
    elapsed = int((time.perf_counter() - t0) * 1000)
    return RecognizeResponse(image_id=req.image_id, text=text, model=settings.vqa_model, elapsed_ms=elapsed)


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
