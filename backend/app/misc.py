"""系统设置(键值持久化) + 项目数据集导出(YOLO / COCO zip)。"""
from __future__ import annotations

import io
import json
import os
import tempfile
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth import UserOut, current_user, require_admin
from app.db import get_conn, tx
from app import projects as P
from app.services.store import store

DEFAULT_SETTINGS = {
    "default_detect_model": "YOLOE-26-L",
    "default_ocr_model": "VLM-OCR",
    "default_seg_model": "YOLOE-26-L-seg",
    "download_proxy": "http://127.0.0.1:1081",
    "data_path": "/data/vislab/projects",
    "artifact_path": "/data/vislab/artifacts",
}

router = APIRouter(prefix="/api", tags=["misc"])


def _load_settings() -> dict:
    out = dict(DEFAULT_SETTINGS)
    with get_conn() as conn:
        for r in conn.execute("SELECT k,v FROM settings_kv").fetchall():
            out[r["k"]] = r["v"]
    return out


@router.get("/settings")
def get_settings(_: UserOut = Depends(current_user)) -> dict:
    return _load_settings()


class SettingsPatch(BaseModel):
    values: dict[str, str]


@router.put("/settings")
def put_settings(req: SettingsPatch, _: UserOut = Depends(require_admin)) -> dict:
    with tx() as conn:
        for k, v in req.values.items():
            conn.execute("INSERT INTO settings_kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, str(v)))
    return _load_settings()


def _coco_zip(pid: str) -> bytes:
    classes = P.list_classes(pid)
    cat_map = {c.id: i + 1 for i, c in enumerate(classes)}  # COCO 类别 id 从 1 起
    images = P.list_images(pid)
    coco = {
        "images": [], "annotations": [],
        "categories": [{"id": i + 1, "name": c.name} for i, c in enumerate(classes)],
    }
    ann_id = 1
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for im in images:
            si = store.get(im.id)
            if si is None:
                continue
            fname = f"{im.id}.png"
            zf.writestr(f"images/{fname}", store.get_bytes(im.id))
            coco["images"].append({"id": im.id, "file_name": fname, "width": im.width, "height": im.height})
            for a in P.get_annotations(im.id):
                cid = cat_map.get(a.class_idx)
                if cid is None:
                    continue
                x1, x2 = sorted((a.x1, a.x2))
                y1, y2 = sorted((a.y1, a.y2))
                x1 = max(0.0, min(x1, im.width)); x2 = max(0.0, min(x2, im.width))
                y1 = max(0.0, min(y1, im.height)); y2 = max(0.0, min(y2, im.height))
                w, h = x2 - x1, y2 - y1
                if w <= 1e-6 or h <= 1e-6:
                    continue  # 跳过退化/越界框，免得 pycocotools 校验失败
                coco["annotations"].append({
                    "id": ann_id, "image_id": im.id, "category_id": cid,
                    "bbox": [x1, y1, w, h], "area": w * h, "iscrowd": 0,
                })
                ann_id += 1
        zf.writestr("annotations.json", json.dumps(coco, ensure_ascii=False, indent=2))
    return buf.getvalue()


def _yolo_zip(pid: str) -> bytes:
    from app.jobs import _materialize_yolo
    with tempfile.TemporaryDirectory() as d:
        _materialize_yolo(pid, d, 0.8)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(d):
                for fn in files:
                    full = os.path.join(root, fn)
                    zf.write(full, os.path.relpath(full, d))
        return buf.getvalue()


@router.get("/projects/{pid}/export")
def export_project(pid: str, fmt: str = "yolo", _: UserOut = Depends(current_user)) -> Response:
    if next((p for p in P.list_projects() if p.id == pid), None) is None:
        raise HTTPException(404, detail="项目不存在")
    if not any(im.boxes > 0 for im in P.list_images(pid)):
        raise HTTPException(422, detail="项目没有已标注图片，无法导出数据集")
    if fmt == "coco":
        data, name = _coco_zip(pid), "coco.zip"
    else:
        data, name = _yolo_zip(pid), "yolo.zip"
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
