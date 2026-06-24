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
from pydantic import BaseModel, Field

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
_sam_models: dict = {}     # SAM 交互式分割（点选/框选精确掩膜）
_bg_session: dict = {}     # rembg 去背 session 缓存（BiRefNet 等）
DEFAULT_SAM = "sam2.1_b.pt"


def _ensure_sam(name: str = DEFAULT_SAM):
    """懒加载 SAM 交互式分割模型（与 YOLOE 同 weights 目录，权重经代理自动下载）。"""
    import os
    os.environ.setdefault("YOLO_CONFIG_DIR", settings.yoloe_config_dir)
    if name not in _sam_models:
        from ultralytics import SAM
        path = os.path.join(settings.yoloe_weights_dir, name)
        _sam_models[name] = SAM(path if os.path.exists(path) else name)
    return _sam_models[name]


def _sam_mask(pil, box=None, points=None, labels=None, name: str = DEFAULT_SAM):
    """SAM 交互式分割 -> bool 掩膜。box=[x1,y1,x2,y2]；points=[[x,y],...] labels=[1前景/0背景]。"""
    import numpy as np
    from PIL import Image
    m = _ensure_sam(name)
    kw: dict = {"verbose": False}
    if box is not None:
        kw["bboxes"] = [float(v) for v in box]
    if points is not None:
        kw["points"] = points
        kw["labels"] = labels if labels is not None else [1] * len(points)
    res = m.predict(pil, **kw)[0]
    if res.masks is None or len(res.masks.data) == 0:
        raise HTTPException(422, detail="SAM 未产生掩膜")
    data = res.masks.data
    data = data.cpu().numpy() if hasattr(data, "cpu") else np.asarray(data)
    mask = data[0] > 0.5  # 取第一掩膜；ultralytics 已对齐原图尺寸
    if mask.shape != (pil.height, pil.width):
        mask = np.asarray(Image.fromarray((mask * 255).astype("uint8")).resize((pil.width, pil.height))) > 127
    return mask


def _sam_everything(pil, min_area: float = 0.003, max_area: float = 0.92, cap: int = 40, name: str = DEFAULT_SAM):
    """SAM「分割一切」自动分割（无 prompt）-> 元素列表，按面积过滤+封顶+降序。

    用于「细·实例」拆解：找出图中所有显著元素（两条船、轮子等），不依赖类别词表。
    """
    import numpy as np
    from PIL import Image
    m = _ensure_sam(name)
    res = m.predict(pil, verbose=False)[0]
    if res.masks is None or len(res.masks.data) == 0:
        return []
    data = res.masks.data
    data = data.cpu().numpy() if hasattr(data, "cpu") else np.asarray(data)
    H, W = pil.height, pil.width
    total = float(H * W)
    items = []
    for k in range(data.shape[0]):
        mk = data[k] > 0.5
        if mk.shape != (H, W):
            mk = np.asarray(Image.fromarray((mk * 255).astype("uint8")).resize((W, H))) > 127
        a = int(mk.sum())
        if a < min_area * total or a > max_area * total:
            continue
        ys, xs = np.where(mk)
        if not len(xs):
            continue
        items.append({"label": "元素", "mask": mk, "bbox": [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())], "_a": a})
    items.sort(key=lambda d: d["_a"], reverse=True)
    for d in items[:cap]:
        d.pop("_a", None)
    return items[:cap]


def _extract_elements(pil, classes: list[str], granularity: str, conf: float, variant: str):
    """统一的元素拆解：返回 [{label, mask, bbox}]。/elements 与 /elements/export 共用，保证一致。

    - 指定 classes：YOLOE-seg 按类（带类别名）。
    - 留空 + instance(细·实例)：SAM 自动分割一切，找出全部元素。
    - 留空 + coarse(粗·大块)：YOLOE-seg 通用词表（语义大块，带类别名）。
    """
    if classes:
        insts = _instances(pil, classes, conf, variant)
    elif granularity == "instance":
        return _sam_everything(pil)
    else:
        insts = _instances(pil, [], conf, variant)
    return [{"label": it["label"], "mask": it["mask"], "bbox": it["bbox"]} for it in insts]


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
    # retina_masks=True 让 masks.data 已缩放回原图尺寸（去掉 letterbox 填充），
    # 否则直接 resize 到 (W,H) 会在非正方形图上拉伸错位。
    res = model.predict(pil, conf=conf, retina_masks=True, verbose=False)[0]
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
    # 限制内联 base64 体积：长边超 2048 缩一下，避免响应/内存暴涨
    if max(out.size) > 2048:
        out.thumbnail((2048, 2048))
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _grabcut(pil, box, iters: int = 5):
    """OpenCV grabCut：用矩形框做前景提取，返回 bool 掩膜。框先夹到图像内并拒绝退化框。"""
    import cv2
    import numpy as np
    img = cv2.cvtColor(np.array(pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    h_img, w_img = img.shape[:2]
    x1, y1, x2, y2 = (int(v) for v in box)
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1
    x = min(max(0, x1), w_img - 1)
    y = min(max(0, y1), h_img - 1)
    x2c = min(max(x + 1, x2), w_img)
    y2c = min(max(y + 1, y2), h_img)
    w, h = x2c - x, y2c - y
    if w <= 0 or h <= 0:
        raise HTTPException(400, detail="框选区域无效")
    mask = np.zeros((h_img, w_img), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, (x, y, w, h), bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    return (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)


def _bg(name: str):
    """缓存 rembg session（BiRefNet/u2net）。"""
    if name not in _bg_session:
        from rembg import new_session
        _bg_session[name] = new_session(name)
    return _bg_session[name]


def _remove_bg(pil):
    """一键去背：优先 BiRefNet（发丝/细边远胜 u2net），失败退 u2net，再退 YOLOE-seg 主体并集。"""
    import numpy as np
    for sess in (settings.rembg_session, "u2net"):
        try:
            from rembg import remove
            out = remove(pil.convert("RGBA"), session=_bg(sess))
            return np.array(out)[..., 3] > 10
        except Exception:
            continue
    insts = _instances(pil, [], settings.yoloe_conf, DEFAULT_SEG)
    if not insts:
        raise HTTPException(503, detail="rembg 不可用且 YOLOE-seg 未检出主体，无法去背")
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
    mode: str = "auto"            # auto(去背) | text | box | point
    classes: list[str] = []
    box: list[float] | None = None
    points: list[list[float]] | None = None   # 点选模式：[[x,y],...]（原图像素）
    point_labels: list[int] | None = None     # 1=前景 0=背景，与 points 等长
    engine: str = "sam"           # box 模式引擎：sam(精确) | grabcut(CPU 兜底)
    feather: int = Field(0, ge=0, le=100)
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
    granularity: str = "instance"
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
    # 夹住羽化半径：不超过 64，也不超过图像短边的一半，避免巨核卡死/报错
    px = min(int(px), 64, (min(mask.shape[:2]) - 1) // 2)
    if px <= 0:
        return mask
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
            # 默认走 SAM 精确掩膜；显式 engine=grabcut 时用 CPU grabCut 兜底
            mask = _grabcut(pil, req.box) if req.engine == "grabcut" else _sam_mask(pil, box=req.box)
        elif req.mode == "point":
            if not req.points:
                raise HTTPException(400, detail="点选模式需提供 points")
            mask = _sam_mask(pil, points=req.points, labels=req.point_labels)
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
        insts = _extract_elements(pil, req.classes, req.granularity, req.conf, req.variant)
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
    insts = _extract_elements(pil, req.classes, req.granularity, req.conf, req.variant)
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
