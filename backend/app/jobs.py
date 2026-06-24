"""异步任务中心：批量推理 / 模型训练 / 导出。

单进程内一个后台 worker 顺序消费任务队列（单卡，串行最稳）。任务元数据落 SQLite(jobs 表)，
实时日志放内存。训练用 Ultralytics 真训，按 epoch 回调更新进度/指标/日志，产出 best.pt 并注册成
「我的训练模型」(trained_models 表)。所有重依赖懒加载。
"""
from __future__ import annotations

import json
import os
import queue
import shutil
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import UserOut, current_user, require_editor
from app.config import settings
from app.db import get_conn, tx
from app import projects as P
from app.services.store import store

_q: "queue.Queue[str]" = queue.Queue()
_live: dict[str, dict] = {}   # job_id -> {logs:[], cancel:Event}
_worker_started = False
_worker_lock = threading.Lock()


def _uid() -> str:
    return uuid.uuid4().hex


def _ensure_worker() -> None:
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        threading.Thread(target=_worker_loop, name="job-worker", daemon=True).start()
        _worker_started = True


def _worker_loop() -> None:
    while True:
        jid = _q.get()
        try:
            row = _get_row(jid)
            if row is None or row["status"] in ("stopped", "failed"):
                continue
            _update(jid, status="running", started_at=time.time())
            live = _live.setdefault(jid, {"logs": [], "cancel": threading.Event()})
            try:
                if row["type"] == "batch":
                    _run_batch(jid, json.loads(row["params"]))
                elif row["type"] == "training":
                    _run_training(jid, json.loads(row["params"]))
                else:
                    _log(jid, f"未知任务类型 {row['type']}")
                if not live["cancel"].is_set():
                    _update(jid, status="success", progress=100, finished_at=time.time())
            except _Cancelled:
                _update(jid, status="stopped", finished_at=time.time())
                _log(jid, "已停止")
            except Exception as e:  # noqa: BLE001
                _update(jid, status="failed", detail=str(e)[:200], finished_at=time.time())
                _log(jid, f"失败：{e}")
        finally:
            _q.task_done()


class _Cancelled(Exception):
    pass


def _cancelled(jid: str) -> bool:
    live = _live.get(jid)
    return bool(live and live["cancel"].is_set())


# ---------------- 持久化 / 进度 ----------------
def _get_row(jid: str):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()


def reconcile_orphans() -> None:
    """启动时把上次残留的 running/queued 行置为 failed —— 进程重启后不存在 worker，否则成僵尸。"""
    with tx() as conn:
        conn.execute(
            "UPDATE jobs SET status='failed', detail='中断（服务重启）', finished_at=? WHERE status IN ('running','queued')",
            (time.time(),),
        )


def _prune_live(keep: int = 300) -> None:
    """限制内存里日志缓冲数量：超阈值时删掉最早的已结束任务（保留运行中的）。"""
    if len(_live) <= keep:
        return
    for jid in list(_live.keys()):
        if len(_live) <= keep:
            break
        row = _get_row(jid)
        if row is None or row["status"] in ("success", "failed", "stopped"):
            _live.pop(jid, None)


def _update(jid: str, **fields) -> None:
    if not fields:
        return
    cols = ",".join(f"{k}=?" for k in fields)
    with tx() as conn:
        conn.execute(f"UPDATE jobs SET {cols} WHERE id=?", [*fields.values(), jid])


def _log(jid: str, line: str) -> None:
    live = _live.setdefault(jid, {"logs": [], "cancel": threading.Event()})
    ts = time.strftime("%H:%M:%S")
    live["logs"].append(f"[{ts}] {line}")
    if len(live["logs"]) > 400:
        del live["logs"][:200]


def _progress(jid: str, done: int, total: int, metric: str = "", detail: str = "", eta: str = "") -> None:
    pct = round(done / total * 100, 1) if total else 0
    _update(jid, done=done, total=total, progress=pct, metric=metric, detail=detail, eta=eta)


# ---------------- 批量推理 ----------------
def _run_batch(jid: str, params: dict) -> None:
    cap = params.get("capability", "detect")
    pid = params.get("project_id")
    imgs = P.list_images(pid) if pid else []
    total = len(imgs)
    _log(jid, f"批量{cap} · {total} 张")
    # 延迟导入，避免与 main 的 include_router 形成 import 期循环
    from app.main import detect as route_detect, inspect as route_inspect, recognize as route_recognize
    from app.schemas import DetectRequest, InspectRequest, RecognizeRequest

    ok = fail = 0
    items: list[dict] = []  # 收集每图结果，落到任务 result，避免 VQA/OCR 结果被丢弃
    for i, im in enumerate(imgs):
        if _cancelled(jid):
            raise _Cancelled()
        try:
            if cap == "detect":
                res = route_detect(DetectRequest(image_id=im.id, query=params.get("query", ""),
                                                 task="detection", engine=params.get("engine", "la"),
                                                 mode=params.get("mode")))
                boxes = [{"label": b.label, "x1": b.x1, "y1": b.y1, "x2": b.x2, "y2": b.y2, "score": b.score} for b in res.boxes]
                n = P.apply_detection_boxes(im.id, boxes)
                items.append({"image_id": im.id, "filename": im.filename, "boxes": n})
            elif cap == "vqa":
                r = route_inspect(InspectRequest(image_id=im.id, query=params.get("query", "")))
                items.append({"image_id": im.id, "filename": im.filename,
                              "answers": [a.model_dump() for a in r.answers]})
            elif cap == "ocr":
                r = route_recognize(RecognizeRequest(image_id=im.id))
                items.append({"image_id": im.id, "filename": im.filename, "text": (r.text or "")[:2000]})
            ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            _log(jid, f"{im.filename} 失败：{e}")
        _progress(jid, i + 1, total, metric=f"成功 {ok} / 失败 {fail}", detail=im.filename)
    _update(jid, result=json.dumps({"ok": ok, "fail": fail, "items": items[:1000]}, ensure_ascii=False))
    _log(jid, f"完成 · 成功 {ok} 失败 {fail}")


# ---------------- 训练 ----------------
def _materialize_yolo(pid: str, out_dir: str, train_ratio: float = 0.8) -> tuple[int, int]:
    """把项目标注导出成 YOLO 目录(images/labels/data.yaml)。返回 (类别数, 样本数)。"""
    classes = P.list_classes(pid)
    names = [c.name for c in classes]
    idx_map = {c.id: i for i, c in enumerate(classes)}  # 重映射到 0..n-1
    images = P.list_images(pid)
    labeled = [im for im in images if im.boxes > 0]
    n_val = max(1, int(len(labeled) * (1 - train_ratio))) if len(labeled) > 4 else 0
    for sub in ("images/train", "images/val", "labels/train", "labels/val"):
        os.makedirs(os.path.join(out_dir, sub), exist_ok=True)
    for k, im in enumerate(sorted(labeled, key=lambda x: x.id)):
        split = "val" if k < n_val else "train"
        si = store.get(im.id)
        if si is None:
            continue
        shutil.copy(si.path, os.path.join(out_dir, f"images/{split}/{im.id}.png"))
        lines = []
        for a in P.get_annotations(im.id):
            ci = idx_map.get(a.class_idx)
            if ci is None:
                continue
            xc = (a.x1 + a.x2) / 2 / im.width
            yc = (a.y1 + a.y2) / 2 / im.height
            w = abs(a.x2 - a.x1) / im.width
            h = abs(a.y2 - a.y1) / im.height
            lines.append(f"{ci} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
        with open(os.path.join(out_dir, f"labels/{split}/{im.id}.txt"), "w") as f:
            f.write("\n".join(lines))
    # 样本太少没切出验证集时，让 val 指向 train，避免 ultralytics 扫到空 val 目录直接报错
    val_split = "images/train" if n_val == 0 else "images/val"
    yaml = f"path: {out_dir}\ntrain: images/train\nval: {val_split}\nnc: {len(names)}\nnames: {names}\n"
    with open(os.path.join(out_dir, "data.yaml"), "w", encoding="utf-8") as f:
        f.write(yaml)
    return len(names), len(labeled)


def _run_training(jid: str, params: dict) -> None:
    pid = params.get("project_id")
    name = params.get("name") or f"train-{jid[:6]}"
    # 用「检测头」基座，匹配 _materialize_yolo 产出的检测标签（cls xc yc w h）。
    # 不要用 *-seg 权重：那是分割任务，会因标签格式不符在数据集校验阶段报错。
    base = params.get("base", "yolo11s.pt")
    epochs = int(params.get("epochs", 100))
    imgsz = int(params.get("imgsz", 640))
    batch = int(params.get("batch", 16))
    work = os.path.join(settings.data_dir, "training", jid)
    os.makedirs(work, exist_ok=True)
    _log(jid, f"准备数据集（项目 {pid}）…")
    nc, n = _materialize_yolo(pid, os.path.join(work, "dataset"), params.get("train_ratio", 0.8))
    _log(jid, f"数据集就绪 · {nc} 类 · {n} 样本 · 基座 {base}")
    if n < 2:
        raise RuntimeError("已标注样本不足，至少需要 2 张带框图片")

    from ultralytics import YOLO  # noqa
    os.environ.setdefault("YOLO_CONFIG_DIR", settings.yoloe_config_dir)
    weight = base if os.path.isabs(base) or os.path.exists(base) else os.path.join(settings.yoloe_weights_dir, base)
    # 不存在的本地路径退回模型名，让 ultralytics 自动下载（如 yolo11s.pt）。
    model = YOLO(weight if os.path.exists(weight) else base)
    t0 = time.time()

    # 取消检查放 on_train_epoch_end（每轮训练循环后即触发，响应快）。
    def on_cancel(trainer):
        if _cancelled(jid):
            trainer.stop = True

    # 指标读取放 on_fit_epoch_end（验证完成后，trainer.metrics 才有 mAP50/95）。
    def on_fit(trainer):
        ep = int(getattr(trainer, "epoch", 0)) + 1
        m = getattr(trainer, "metrics", {}) or {}
        mp = m.get("metrics/mAP50(B)") or m.get("metrics/mAP50-95(B)") or 0
        per = (time.time() - t0) / max(ep, 1)
        eta = f"剩 {int(per * (epochs - ep) / 60)} 分"
        _progress(jid, ep, epochs, metric=f"mAP {float(mp):.3f}" if mp else "训练中", detail=f"epoch {ep}/{epochs}", eta=eta)
        _log(jid, f"epoch {ep}/{epochs}  mAP50 {float(mp):.3f}")

    model.add_callback("on_train_epoch_end", on_cancel)
    model.add_callback("on_fit_epoch_end", on_fit)
    _log(jid, "开始训练…")
    model.train(data=os.path.join(work, "dataset", "data.yaml"), epochs=epochs, imgsz=imgsz,
                batch=batch, project=work, name="run", exist_ok=True, verbose=False)
    if _cancelled(jid):
        raise _Cancelled()
    best = os.path.join(work, "run", "weights", "best.pt")
    metric = _get_row(jid)["metric"] if _get_row(jid) else ""
    if os.path.exists(best):
        mid = _uid()
        with tx() as conn:
            conn.execute("INSERT INTO trained_models(id,name,task,base,weights,metric,project_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
                         (mid, name, params.get("task", "detect"), base, best, metric, pid or "", time.time()))
        _update(jid, result=json.dumps({"model_id": mid, "weights": best}))
        _log(jid, f"训练完成 · 已上架模型「{name}」")
    else:
        _log(jid, "训练结束但未找到 best.pt")


# ---------------- Schemas ----------------
class JobOut(BaseModel):
    id: str
    type: str
    capability: str
    project_id: str
    project_name: str
    status: str
    progress: float
    total: int
    done: int
    metric: str
    detail: str
    eta: str
    who: str
    created_at: float
    started_at: float | None = None
    finished_at: float | None = None


class JobDetail(JobOut):
    params: dict = {}
    result: dict = {}
    logs: list[str] = []


class BatchRequest(BaseModel):
    project_id: str
    capability: str = "detect"
    engine: str = "la"
    query: str = ""
    mode: str | None = None


class TrainRequest(BaseModel):
    project_id: str
    name: str = ""
    task: str = "detect"
    base: str = "yolo11s.pt"
    epochs: int = 100
    imgsz: int = 640
    batch: int = 16
    train_ratio: float = 0.8


def _row_to_job(r) -> JobOut:
    return JobOut(
        id=r["id"], type=r["type"], capability=r["capability"], project_id=r["project_id"],
        project_name=r["project_name"], status=r["status"], progress=r["progress"], total=r["total"],
        done=r["done"], metric=r["metric"], detail=r["detail"], eta=r["eta"], who=r["who"],
        created_at=r["created_at"], started_at=r["started_at"], finished_at=r["finished_at"],
    )


def _create(jtype: str, capability: str, pid: str, params: dict, who: str) -> JobOut:
    pname = ""
    if pid:
        pr = next((p for p in P.list_projects() if p.id == pid), None)
        pname = pr.name if pr else ""
    jid = _uid()
    with tx() as conn:
        conn.execute(
            "INSERT INTO jobs(id,type,capability,project_id,project_name,status,who,params,created_at)"
            " VALUES(?,?,?,?,?, 'queued', ?,?,?)",
            (jid, jtype, capability, pid, pname, who, json.dumps(params), time.time()),
        )
    _prune_live()
    _live[jid] = {"logs": [], "cancel": threading.Event()}
    _ensure_worker()
    _q.put(jid)
    return _row_to_job(_get_row(jid))


# ---------------- 路由 ----------------
router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs", response_model=list[JobOut])
def api_jobs(type: str | None = None, _: UserOut = Depends(current_user)) -> list[JobOut]:
    with get_conn() as conn:
        if type:
            rows = conn.execute("SELECT * FROM jobs WHERE type=? ORDER BY created_at DESC", (type,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [_row_to_job(r) for r in rows]


@router.get("/jobs/{jid}", response_model=JobDetail)
def api_job(jid: str, _: UserOut = Depends(current_user)) -> JobDetail:
    r = _get_row(jid)
    if r is None:
        raise HTTPException(404, detail="任务不存在")
    base = _row_to_job(r)
    live = _live.get(jid, {})
    return JobDetail(**base.model_dump(), params=json.loads(r["params"]), result=json.loads(r["result"]), logs=live.get("logs", []))


@router.post("/jobs/{jid}/stop")
def api_stop(jid: str, _: UserOut = Depends(require_editor)) -> dict:
    r = _get_row(jid)
    if r is None:
        raise HTTPException(404, detail="任务不存在")
    live = _live.setdefault(jid, {"logs": [], "cancel": threading.Event()})
    live["cancel"].set()
    if r["status"] == "queued":
        _update(jid, status="stopped", finished_at=time.time())
    return {"ok": True}


@router.post("/batch", response_model=JobOut)
def api_batch(req: BatchRequest, user: UserOut = Depends(require_editor)) -> JobOut:
    return _create("batch", req.capability, req.project_id,
                   {"capability": req.capability, "engine": req.engine, "query": req.query, "mode": req.mode,
                    "project_id": req.project_id}, user.name or user.username)


@router.get("/training", response_model=list[JobOut])
def api_training_list(_: UserOut = Depends(current_user)) -> list[JobOut]:
    return api_jobs(type="training")


@router.post("/training", response_model=JobOut)
def api_training(req: TrainRequest, user: UserOut = Depends(require_editor)) -> JobOut:
    return _create("training", req.task, req.project_id, req.model_dump(), user.name or user.username)


@router.get("/trained-models")
def api_trained(_: UserOut = Depends(current_user)) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT id,name,task,base,metric,created_at FROM trained_models ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]
