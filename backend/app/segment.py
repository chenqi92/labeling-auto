"""分割 / 抠图 / 元素拆解。

引擎选择（按可用性自动降级，全部懒加载，避免无 GPU 环境 import 失败）：
- 文本/自动实例分割：Ultralytics YOLOE-seg（开放词汇，复用已下的 yoloe-26l/s-seg.pt）。
- 框选前景：OpenCV grabCut（纯 CPU，无需额外模型）。
- 一键去背：rembg（若装），否则退化为 YOLOE-seg 主体并集掩膜。

抠图结果以透明 PNG 的 base64 直接回前端预览/下载；元素拆解可打包 zip + 图层 JSON。
"""
from __future__ import annotations

import base64
import io
import json
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import UserOut, current_user
from app.config import settings
from app.services.store import store

# YOLOE-seg 变体权重
SEG_VARIANTS = {"yoloe-26l-seg": "yoloe-26l-seg.pt", "yoloe-26s-seg": "yoloe-26s-seg.pt"}
DEFAULT_SEG = "yoloe-26l-seg"
# 「自动」拆解时的通用词表（YOLOE 需要类别提示）
AUTO_VOCAB = [
    "person", "car", "boat", "ship", "building", "tree", "sign", "light",
    "container", "box", "animal", "road", "sky", "water", "machine", "text",
]

_seg_models: dict = {}


def _ensure_seg(variant: str):
    """懒加载并缓存一个 YOLOE-seg 模型。"""
    import os
    os.environ.setdefault("YOLO_CONFIG_DIR", settings.yoloe_config_dir)
    key = variant if variant in SEG_VARIANTS else DEFAULT_SEG
    if key not in _seg_models:
        from ultralytics import YOLOE
        path = os.path.join(settings.yoloe_weights_dir, SEG_VARIANTS[key])
        _seg_models[key] = YOLOE(path)
    return _seg_models[key]


def _pil(image_id: str):
    if store.get(image_id) is None:
        raise HTTPException(404, detail="图片不存在")
    return store.get_pil(image_id)


def _instances(pil, classes: list[str], conf: float, variant: str):
    """跑 YOLOE-seg，返回实例列表：label/score/bbox(像素)/polygon(像素点)/mask(bool ndarray)。"""
    import numpy as np
    from PIL import Image
    model = _ensure_seg(variant)
    names = classes or AUTO_VOCAB
    model.set_classes(names, model.get_text_pe(names))
    res = model.predict(pil, conf=conf, verbose=False)[0]
    out = []
    if res.masks is None:
        return out
    polys = res.masks.xy  # 每个实例的多边形像素点
    boxes = res.boxes
    data = res.masks.data.cpu().numpy() if hasattr(res.masks.data, "cpu") else np.asarray(res.masks.data)
    H, W = pil.height, pil.width
    for i in range(len(polys)):
        cls_id = int(boxes.cls[i].item())
        score = float(boxes.conf[i].item())
        xyxy = [float(v) for v in boxes.xyxy[i].tolist()]
        # mask 上采样到原图尺寸
        m = data[i]
        mask = np.asarray(Image.fromarray((m * 255).astype("uint8")).resize((W, H))) > 127
        out.append({
            "label": names[cls_id] if cls_id < len(names) else f"#{cls_id}",
            "score": score,
            "bbox": xyxy,
            "polygon": [[float(x), float(y)] for x, y in polys[i].tolist()],
            "mask": mask,
        })
    return out


def _cutout_b64(pil, mask, crop_bbox=None) -> str:
    """按布尔掩膜抠出透明 PNG，返回 base64（可选裁到 bbox）。"""
    import numpy as np
    from PIL import Image
    rgba = pil.convert("RGBA")
    arr = np.array(rgba)
    arr[..., 3] = np.where(mask, 255, 0).astype("uint8")
    out = Image.fromarray(arr)
    if crop_bbox:
        x1, y1, x2, y2 = (int(v) for v in crop_bbox)
        out = out.crop((max(0, x1), max(0, y1), min(pil.width, x2), min(pil.height, y2)))
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _grabcut(pil, box, iters: int = 5):
    """OpenCV grabCut：用矩形框做前景提取，返回 bool 掩膜。"""
    import cv2
    import numpy as np
    img = cv2.cvtColor(np.array(pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    mask = np.zeros(img.shape[:2], np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    x1, y1, x2, y2 = (int(v) for v in box)
    rect = (max(0, x1), max(0, y1), max(1, x2 - x1), max(1, y2 - y1))
    cv2.grabCut(img, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    return (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)


def _remove_bg(pil):
    """一键去背：优先 rembg，否则退化为 YOLOE-seg 主体并集。返回 bool 掩膜。"""
    import numpy as np
    try:
        from rembg import remove
        out = remove(pil.convert("RGBA"))
        return np.array(out)[..., 3] > 10
    except Exception:
        insts = _instances(pil, [], settings.yoloe_conf, DEFAULT_SEG)
        if not insts:
            raise HTTPException(503, detail="未安装 rembg 且 YOLOE-seg 未检出主体，无法去背")
        m = np.zeros((pil.height, pil.width), bool)
        for it in insts:
            m |= it["mask"]
        return m


# ---------------- Schemas ----------------
class SegRequest(BaseModel):
    image_id: str
    classes: list[str] = []
    conf: float = 0.25
    variant: str = DEFAULT_SEG


class SegInstance(BaseModel):
    label: str
    score: float
    bbox: list[float]
    polygon: list[list[float]]
    area_pct: float


class SegResponse(BaseModel):
    image_id: str
    instances: list[SegInstance]


class MatteRequest(BaseModel):
    image_id: str
    mode: str = "auto"            # auto(去背) | text | box
    classes: list[str] = []
    box: list[float] | None = None
    feather: int = 0
    variant: str = DEFAULT_SEG


class MatteResponse(BaseModel):
    image_id: str
    png_b64: str                  # 透明 PNG
    instances: list[SegInstance] = []


class ElementsRequest(BaseModel):
    image_id: str
    classes: list[str] = []
    granularity: str = "instance"  # instance | coarse
    conf: float = 0.25
    variant: str = DEFAULT_SEG


class ElementItem(BaseModel):
    idx: int
    name: str
    cls: str
    area_pct: float
    bbox: list[float]
    thumb_b64: str


class ElementsResponse(BaseModel):
    image_id: str
    elements: list[ElementItem]


class ElementsExport(BaseModel):
    image_id: str
    classes: list[str] = []
    selected: list[int] = []
    keep_position: bool = True
    conf: float = 0.25
    variant: str = DEFAULT_SEG


def _area_pct(mask) -> float:
    import numpy as np
    return round(float(np.count_nonzero(mask)) / float(mask.size) * 100, 1)


def _feather(mask, px: int):
    if px <= 0:
        return mask
    import cv2
    import numpy as np
    m = (mask.astype("uint8")) * 255
    k = max(1, px) * 2 + 1
    m = cv2.GaussianBlur(m, (k, k), 0)
    return m > 127


# ---------------- 路由 ----------------
router = APIRouter(prefix="/api", tags=["segment"])


@router.post("/segment", response_model=SegResponse)
def api_segment(req: SegRequest, _: UserOut = Depends(current_user)) -> SegResponse:
    pil = _pil(req.image_id)
    try:
        insts = _instances(pil, req.classes, req.conf, req.variant)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"分割失败：{e}")
    return SegResponse(image_id=req.image_id, instances=[
        SegInstance(label=i["label"], score=i["score"], bbox=i["bbox"], polygon=i["polygon"], area_pct=_area_pct(i["mask"]))
        for i in insts
    ])


@router.post("/matte", response_model=MatteResponse)
def api_matte(req: MatteRequest, _: UserOut = Depends(current_user)) -> MatteResponse:
    pil = _pil(req.image_id)
    try:
        insts_out: list[SegInstance] = []
        if req.mode == "box":
            if not req.box:
                raise HTTPException(400, detail="框选模式需提供 box")
            mask = _grabcut(pil, req.box)
        elif req.mode == "text":
            insts = _instances(pil, req.classes, settings.yoloe_conf, req.variant)
            if not insts:
                raise HTTPException(422, detail="未匹配到目标，换个描述或用自动去背")
            import numpy as np
            mask = np.zeros((pil.height, pil.width), bool)
            for it in insts:
                mask |= it["mask"]
            insts_out = [SegInstance(label=i["label"], score=i["score"], bbox=i["bbox"], polygon=i["polygon"], area_pct=_area_pct(i["mask"])) for i in insts]
        else:  # auto 去背
            mask = _remove_bg(pil)
        mask = _feather(mask, req.feather)
        png = _cutout_b64(pil, mask)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"抠图失败：{e}")
    return MatteResponse(image_id=req.image_id, png_b64=png, instances=insts_out)


@router.post("/elements", response_model=ElementsResponse)
def api_elements(req: ElementsRequest, _: UserOut = Depends(current_user)) -> ElementsResponse:
    pil = _pil(req.image_id)
    try:
        insts = _instances(pil, req.classes, req.conf, req.variant)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"元素拆解失败：{e}")
    els: list[ElementItem] = []
    for i, it in enumerate(insts):
        els.append(ElementItem(
            idx=i, name=f"{it['label']}_{i + 1}", cls=it["label"], area_pct=_area_pct(it["mask"]),
            bbox=it["bbox"], thumb_b64=_cutout_b64(pil, it["mask"], it["bbox"]),
        ))
    return ElementsResponse(image_id=req.image_id, elements=els)


@router.post("/elements/export")
def api_elements_export(req: ElementsExport, _: UserOut = Depends(current_user)):
    from fastapi.responses import Response
    pil = _pil(req.image_id)
    insts = _instances(pil, req.classes, req.conf, req.variant)
    pick = set(req.selected) if req.selected else set(range(len(insts)))
    buf = io.BytesIO()
    layers = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, it in enumerate(insts):
            if i not in pick:
                continue
            crop = None if req.keep_position else it["bbox"]
            png_b64 = _cutout_b64(pil, it["mask"], crop)
            name = f"{it['label']}_{i + 1}.png"
            zf.writestr(name, base64.b64decode(png_b64))
            layers.append({"file": name, "class": it["label"], "bbox": it["bbox"], "area_pct": _area_pct(it["mask"])})
        zf.writestr("layers.json", json.dumps({"image": req.image_id, "layers": layers}, ensure_ascii=False, indent=2))
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="elements.zip"'})
