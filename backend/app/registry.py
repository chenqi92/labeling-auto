"""模型管理 / 引擎生命周期 + GPU 显存 / 资源监控。

状态尽量取真实来源：
- 检测 LocateAnything：app.engine.manager 的加载状态。
- YOLOE 检测/分割：权重文件是否存在 + 进程内是否已缓存加载。
- VQA / OCR(VLM)：Ollama /api/tags(已下载) 与 /api/ps(已加载显存)。
- GPU 利用率 / 显存：pynvml 优先，否则解析 nvidia-smi；磁盘用 shutil。

load/unload 对 LA(manager) 与 Ollama(keep_alive) 是真实操作；YOLOE 仅进程内缓存增删。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import UserOut, current_user, require_admin
from app.config import settings

GPU_TOTAL_FALLBACK = 24.0  # 查询失败时的标称总显存(GB)


# ---------------- 已知模型目录 ----------------
# kind 决定 load/unload/status 的解析方式：la | yoloe | ollama
CATALOG = [
    {"group": "检测 Detection", "items": [
        {"name": "LocateAnything-3B", "kind": "la", "src": "内置", "vram": 3.2, "mutex": True, "lang": "中/英", "acc": 5, "speed": 2, "weight": None},
        {"name": "YOLOE-26-L", "kind": "yoloe", "src": "内置", "vram": 1.1, "mutex": False, "lang": "英", "acc": 4, "speed": 4, "weight": "yoloe-26l-seg.pt"},
        {"name": "YOLOE-26-S", "kind": "yoloe", "src": "内置", "vram": 0.4, "mutex": False, "lang": "英", "acc": 3, "speed": 5, "weight": "yoloe-26s-seg.pt"},
    ]},
    {"group": "视觉问答 VQA", "items": [
        {"name": settings.vqa_model, "kind": "ollama", "src": "Ollama", "vram": 10.4, "mutex": True, "lang": "中/英", "acc": 5, "speed": 2, "weight": None},
    ]},
    {"group": "分割 Segmentation", "items": [
        {"name": "YOLOE-26-L-seg", "kind": "yoloe", "src": "内置", "vram": 1.3, "mutex": False, "lang": "英", "acc": 4, "speed": 4, "weight": "yoloe-26l-seg.pt"},
    ]},
]


_ollama_cache: dict = {"t": -1e9, "val": (set(), set())}
_ollama_lock = threading.Lock()
_OLLAMA_TTL = 3.0  # 看板轮询复用同一次探测，别每个请求都打 Ollama


def _ollama_models() -> tuple[set[str], set[str]]:
    """返回 (已下载模型名, 已加载显存模型名)。带短 TTL 缓存，失败则空集。"""
    now = time.time()
    with _ollama_lock:
        if now - _ollama_cache["t"] < _OLLAMA_TTL:
            return _ollama_cache["val"]
    base = settings.ollama_url.rstrip("/")
    downloaded, loaded = set(), set()
    try:
        with urllib.request.urlopen(f"{base}/api/tags", timeout=1.5) as r:
            for m in json.loads(r.read().decode()).get("models", []):
                downloaded.add(m.get("name") or m.get("model") or "")
    except Exception:
        pass
    try:
        with urllib.request.urlopen(f"{base}/api/ps", timeout=1.5) as r:
            for m in json.loads(r.read().decode()).get("models", []):
                loaded.add(m.get("name") or m.get("model") or "")
    except Exception:
        pass
    with _ollama_lock:
        _ollama_cache["t"] = now
        _ollama_cache["val"] = (downloaded, loaded)
    return downloaded, loaded


def _yoloe_loaded(weight: str | None) -> bool:
    if not weight:
        return False
    try:
        from app import segment
        from app.engine import yoloe as yo
        keys = {v: k for k, v in segment.SEG_VARIANTS.items()}
        seg_loaded = any(segment.SEG_VARIANTS.get(k) == weight for k in segment._seg_models)
        det_loaded = any(getattr(m, "_model", None) is not None for m in getattr(yo, "_models", {}).values())
        return bool(seg_loaded or det_loaded)
    except Exception:
        return False


def _status_for(item: dict, ollama_dl: set[str], ollama_ld: set[str]) -> tuple[str, bool]:
    """返回 (status, downloaded_local)。status: loaded|downloaded|remote。"""
    kind = item["kind"]
    if kind == "la":
        try:
            from app.engine.manager import manager
            return ("loaded" if manager.state == "ready" else "downloaded"), True
        except Exception:
            return "downloaded", True
    if kind == "yoloe":
        path = os.path.join(settings.yoloe_weights_dir, item["weight"]) if item["weight"] else ""
        exists = bool(path) and os.path.exists(path)
        if _yoloe_loaded(item["weight"]):
            return "loaded", True
        return ("downloaded" if exists else "remote"), exists
    if kind == "ollama":
        name = item["name"]
        if name in ollama_ld:
            return "loaded", True
        if name in ollama_dl:
            return "downloaded", True
        return "remote", False
    return "remote", False


# ---------------- GPU / 资源 ----------------
def gpu_info() -> dict:
    total = used = util = None
    # pynvml 优先
    try:
        import pynvml
        pynvml.nvmlInit()
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        mem = pynvml.nvmlDeviceGetMemoryInfo(h)
        total = round(mem.total / 1e9, 1)
        used = round(mem.used / 1e9, 1)
        util = int(pynvml.nvmlDeviceGetUtilizationRates(h).gpu)
        pynvml.nvmlShutdown()
    except Exception:
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.total,memory.used,utilization.gpu", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=4,
            ).stdout.strip().splitlines()
            if out:
                t, u, g = (x.strip() for x in out[0].split(","))
                total = round(float(t) / 1024, 1)
                used = round(float(u) / 1024, 1)
                util = int(float(g))
        except Exception:
            pass
    try:
        du = shutil.disk_usage(settings.data_dir if os.path.isdir(settings.data_dir) else "/")
        disk_total = round(du.total / 1e12, 2)
        disk_used = round(du.used / 1e12, 2)
    except Exception:
        disk_total = disk_used = None
    return {
        "gpu_total_gb": total or GPU_TOTAL_FALLBACK,
        "gpu_used_gb": used,
        "gpu_util_pct": util,
        "disk_total_tb": disk_total,
        "disk_used_tb": disk_used,
    }


# ---------------- Schemas ----------------
class ModelEntry(BaseModel):
    name: str
    group: str
    kind: str
    src: str
    vram: float
    mutex: bool
    lang: str
    acc: int
    speed: int
    status: str           # loaded | downloaded | remote
    downloaded: bool


class RegistryResponse(BaseModel):
    models: list[ModelEntry]
    gpu_total_gb: float
    gpu_used_gb: float | None = None
    loaded: list[str] = []


class ModelAction(BaseModel):
    name: str


router = APIRouter(prefix="/api", tags=["registry"])


def _all_items():
    for g in CATALOG:
        for it in g["items"]:
            yield g["group"], it


@router.get("/registry", response_model=RegistryResponse)
def api_registry(_: UserOut = Depends(current_user)) -> RegistryResponse:
    ol_dl, ol_ld = _ollama_models()
    models: list[ModelEntry] = []
    loaded: list[str] = []
    for group, it in _all_items():
        status, dl = _status_for(it, ol_dl, ol_ld)
        if status == "loaded":
            loaded.append(it["name"])
        models.append(ModelEntry(
            name=it["name"], group=group, kind=it["kind"], src=it["src"], vram=it["vram"],
            mutex=it["mutex"], lang=it["lang"], acc=it["acc"], speed=it["speed"], status=status, downloaded=dl,
        ))
    g = gpu_info()
    return RegistryResponse(models=models, gpu_total_gb=g["gpu_total_gb"], gpu_used_gb=g["gpu_used_gb"], loaded=loaded)


@router.get("/gpu")
def api_gpu(_: UserOut = Depends(current_user)) -> dict:
    g = gpu_info()
    _, ol_ld = _ollama_models()
    loaded = [it["name"] for _, it in _all_items() if _status_for(it, set(), ol_ld)[0] == "loaded"]
    g["loaded"] = loaded
    return g


def _find(name: str) -> dict | None:
    for _, it in _all_items():
        if it["name"] == name:
            return it
    return None


@router.post("/registry/load")
def api_load(req: ModelAction, _: UserOut = Depends(require_admin)) -> dict:
    it = _find(req.name)
    if it is None:
        raise HTTPException(404, detail="未知模型")
    try:
        if it["kind"] == "la":
            from app.engine import vqa
            from app.engine.manager import manager
            # 互斥：加载 LA 前先卸 VQA 释放显存（与 /api/detect 一致，避免 16GB 卡 OOM）
            if settings.vqa_exclusive and it.get("mutex"):
                try:
                    vqa.unload()
                except Exception:
                    pass
            manager.ensure_loaded()
        elif it["kind"] == "ollama":
            from app.engine.manager import manager
            # 互斥：预热 VLM 前先卸 LA 释放显存（与 /api/inspect 一致）
            if settings.vqa_exclusive and it.get("mutex"):
                manager.unload()
            base = settings.ollama_url.rstrip("/")
            body = json.dumps({"model": req.name, "keep_alive": settings.vqa_keep_alive}).encode()
            urllib.request.urlopen(urllib.request.Request(f"{base}/api/generate", data=body, headers={"Content-Type": "application/json"}), timeout=settings.vqa_timeout)
        elif it["kind"] == "yoloe":
            from app import segment
            segment._ensure_seg(segment.DEFAULT_SEG)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"加载失败：{e}")
    return {"ok": True}


@router.post("/registry/unload")
def api_unload(req: ModelAction, _: UserOut = Depends(require_admin)) -> dict:
    it = _find(req.name)
    if it is None:
        raise HTTPException(404, detail="未知模型")
    try:
        if it["kind"] == "la":
            from app.engine.manager import manager
            manager.unload()
        elif it["kind"] == "ollama":
            base = settings.ollama_url.rstrip("/")
            body = json.dumps({"model": req.name, "keep_alive": 0}).encode()
            urllib.request.urlopen(urllib.request.Request(f"{base}/api/generate", data=body, headers={"Content-Type": "application/json"}), timeout=15)
        elif it["kind"] == "yoloe":
            import gc
            from app import segment
            from app.engine import yoloe as yo
            segment._seg_models.clear()
            # 同时清检测路径的缓存（/api/detect 用的 yoloe._models），否则卸载形同虚设
            for m in getattr(yo, "_models", {}).values():
                try:
                    m._model = None
                except Exception:
                    pass
            getattr(yo, "_models", {}).clear()
            gc.collect()
            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=f"卸载失败：{e}")
    return {"ok": True}
