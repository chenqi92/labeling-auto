"""项目 / 图片 / 类别 / 标注 / 数据集版本 的持久化与路由。

后端成为项目数据的真源：关系数据存 SQLite（见 db.py 的表），图片像素仍由 services.store
落盘并按 /api/images/{id}/file 提供（检测/VQA/OCR 也继续用 store 取字节，零改动）。
"""
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.auth import UserOut, current_user, require_editor
from app.db import get_conn, tx
from app.services.store import store

# 类别配色板（与前端 lib/colors PALETTE 对齐）
PALETTE = [
    "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16",
    "#f97316", "#14b8a6", "#6366f1", "#eab308", "#10b981", "#f43f5e", "#8b5cf6", "#0ea5e9",
    "#d946ef", "#65a30d", "#fb923c", "#2dd4bf",
]


def color_for(idx: int) -> str:
    return PALETTE[idx % len(PALETTE)]


def _uid() -> str:
    return uuid.uuid4().hex


# ---------------- Schemas ----------------
class ProjectOut(BaseModel):
    id: str
    name: str
    images: int = 0
    labeled: int = 0
    boxes: int = 0
    classes: int = 0
    created_at: float = 0


class ImageOut(BaseModel):
    id: str
    filename: str
    width: int
    height: int
    url: str
    status: str = "todo"
    boxes: int = 0


class ClassOut(BaseModel):
    id: int  # = idx
    name: str
    color: str


class AnnotationIn(BaseModel):
    class_idx: int
    x1: float
    y1: float
    x2: float
    y2: float
    score: float | None = None
    source: str = "manual"


class AnnotationOut(AnnotationIn):
    id: str


class DatasetOut(BaseModel):
    id: str
    name: str
    sample_count: int
    class_count: int
    box_count: int
    split: str
    created_at: float


# ---------------- 项目 ----------------
def seed_default() -> None:
    with get_conn() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM projects").fetchone()["c"]
    if n == 0:
        _create_project("默认项目")


def _create_project(name: str) -> ProjectOut:
    pid = _uid()
    now = time.time()
    with tx() as conn:
        conn.execute("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)",
                     (pid, name.strip() or "未命名项目", now, now))
    return ProjectOut(id=pid, name=name.strip() or "未命名项目", created_at=now)


def list_projects() -> list[ProjectOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY created_at").fetchall()
        out: list[ProjectOut] = []
        for r in rows:
            pid = r["id"]
            imgs = conn.execute("SELECT COUNT(*) c FROM images WHERE project_id=?", (pid,)).fetchone()["c"]
            cls = conn.execute("SELECT COUNT(*) c FROM classes WHERE project_id=?", (pid,)).fetchone()["c"]
            boxes = conn.execute(
                "SELECT COUNT(*) c FROM annotations a JOIN images i ON a.image_id=i.id WHERE i.project_id=?",
                (pid,),
            ).fetchone()["c"]
            labeled = conn.execute(
                "SELECT COUNT(DISTINCT a.image_id) c FROM annotations a JOIN images i ON a.image_id=i.id WHERE i.project_id=?",
                (pid,),
            ).fetchone()["c"]
            out.append(ProjectOut(id=pid, name=r["name"], images=imgs, labeled=labeled, boxes=boxes, classes=cls, created_at=r["created_at"]))
    return out


def _require_project(pid: str) -> None:
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM projects WHERE id=?", (pid,)).fetchone() is None:
            raise HTTPException(404, detail="项目不存在")


# ---------------- 类别 ----------------
def list_classes(pid: str) -> list[ClassOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT idx,name,color FROM classes WHERE project_id=? ORDER BY idx", (pid,)).fetchall()
    return [ClassOut(id=r["idx"], name=r["name"], color=r["color"]) for r in rows]


def ensure_class(pid: str, name: str) -> int:
    """按名字找类别，没有则新建，返回 idx。供检测自动落标用。"""
    name = name.strip() or "object"
    with get_conn() as conn:
        row = conn.execute("SELECT idx FROM classes WHERE project_id=? AND name=?", (pid, name)).fetchone()
        if row is not None:
            return row["idx"]
        nxt = conn.execute("SELECT COALESCE(MAX(idx)+1,0) n FROM classes WHERE project_id=?", (pid,)).fetchone()["n"]
    with tx() as conn:
        conn.execute("INSERT INTO classes(project_id,idx,name,color) VALUES(?,?,?,?)",
                     (pid, nxt, name, color_for(nxt)))
    return nxt


def add_class(pid: str, name: str, color: str | None = None) -> ClassOut:
    with get_conn() as conn:
        nxt = conn.execute("SELECT COALESCE(MAX(idx)+1,0) n FROM classes WHERE project_id=?", (pid,)).fetchone()["n"]
    col = color or color_for(nxt)
    with tx() as conn:
        conn.execute("INSERT INTO classes(project_id,idx,name,color) VALUES(?,?,?,?)",
                     (pid, nxt, name.strip() or f"class_{nxt}", col))
    return ClassOut(id=nxt, name=name.strip() or f"class_{nxt}", color=col)


# ---------------- 图片 ----------------
def _image_row_out(conn, r) -> ImageOut:
    boxes = conn.execute("SELECT COUNT(*) c FROM annotations WHERE image_id=?", (r["id"],)).fetchone()["c"]
    return ImageOut(id=r["id"], filename=r["filename"], width=r["width"], height=r["height"],
                    url=f"/api/images/{r['id']}/file", status=r["status"], boxes=boxes)


def list_images(pid: str) -> list[ImageOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM images WHERE project_id=? ORDER BY created_at", (pid,)).fetchall()
        return [_image_row_out(conn, r) for r in rows]


def add_images(pid: str, files: list[tuple[str, bytes]]) -> list[ImageOut]:
    out: list[ImageOut] = []
    now = time.time()
    for filename, data in files:
        si = store.add(filename, data)  # 落盘 + store 索引（检测取字节仍走 store）
        with tx() as conn:
            conn.execute(
                "INSERT INTO images(id,project_id,filename,width,height,status,created_at) VALUES(?,?,?,?,?, 'todo', ?)",
                (si.id, pid, si.filename, si.width, si.height, now),
            )
        out.append(ImageOut(id=si.id, filename=si.filename, width=si.width, height=si.height,
                            url=f"/api/images/{si.id}/file", status="todo", boxes=0))
    return out


def remove_image(iid: str) -> None:
    with tx() as conn:
        cur = conn.execute("DELETE FROM images WHERE id=?", (iid,))
    if cur.rowcount == 0:
        raise HTTPException(404, detail="图片不存在")
    store.remove(iid)


def image_project(iid: str) -> str | None:
    with get_conn() as conn:
        r = conn.execute("SELECT project_id FROM images WHERE id=?", (iid,)).fetchone()
    return r["project_id"] if r else None


# ---------------- 标注 ----------------
def get_annotations(iid: str) -> list[AnnotationOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM annotations WHERE image_id=? ORDER BY created_at", (iid,)).fetchall()
    return [AnnotationOut(id=r["id"], class_idx=r["class_idx"], x1=r["x1"], y1=r["y1"], x2=r["x2"], y2=r["y2"],
                          score=r["score"], source=r["source"]) for r in rows]


def set_annotations(iid: str, anns: list[AnnotationIn]) -> list[AnnotationOut]:
    """整图替换标注（画布去抖保存的最简语义）。同时更新图片状态。"""
    if image_project(iid) is None:
        raise HTTPException(404, detail="图片不存在")
    now = time.time()
    out: list[AnnotationOut] = []
    with tx() as conn:
        conn.execute("DELETE FROM annotations WHERE image_id=?", (iid,))
        for a in anns:
            aid = _uid()
            conn.execute(
                "INSERT INTO annotations(id,image_id,class_idx,x1,y1,x2,y2,score,source,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?)",
                (aid, iid, a.class_idx, a.x1, a.y1, a.x2, a.y2, a.score, a.source, now),
            )
            out.append(AnnotationOut(id=aid, **a.model_dump()))
        conn.execute("UPDATE images SET status=? WHERE id=?", ("done" if anns else "todo", iid))
    return out


# ---------------- 数据集版本 ----------------
def list_datasets(pid: str) -> list[DatasetOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM dataset_versions WHERE project_id=? ORDER BY created_at DESC", (pid,)).fetchall()
    return [DatasetOut(id=r["id"], name=r["name"], sample_count=r["sample_count"], class_count=r["class_count"],
                       box_count=r["box_count"], split=r["split"], created_at=r["created_at"]) for r in rows]


def snapshot_dataset(pid: str, name: str | None, split: str) -> DatasetOut:
    with get_conn() as conn:
        samples = conn.execute(
            "SELECT COUNT(DISTINCT a.image_id) c FROM annotations a JOIN images i ON a.image_id=i.id WHERE i.project_id=?",
            (pid,),
        ).fetchone()["c"]
        boxes = conn.execute(
            "SELECT COUNT(*) c FROM annotations a JOIN images i ON a.image_id=i.id WHERE i.project_id=?",
            (pid,),
        ).fetchone()["c"]
        cls = conn.execute("SELECT COUNT(*) c FROM classes WHERE project_id=?", (pid,)).fetchone()["c"]
        ver = conn.execute("SELECT COUNT(*) c FROM dataset_versions WHERE project_id=?", (pid,)).fetchone()["c"] + 1
    did = _uid()
    now = time.time()
    dname = (name or f"v{ver}").strip()
    with tx() as conn:
        conn.execute(
            "INSERT INTO dataset_versions(id,project_id,name,sample_count,class_count,box_count,split,created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (did, pid, dname, samples, cls, boxes, split, now),
        )
    return DatasetOut(id=did, name=dname, sample_count=samples, class_count=cls, box_count=boxes, split=split, created_at=now)


# ================= 路由 =================
router = APIRouter(prefix="/api", tags=["projects"])


class CreateProject(BaseModel):
    name: str = ""


class RenameProject(BaseModel):
    name: str


class CreateClass(BaseModel):
    name: str
    color: str | None = None


class UpdateClass(BaseModel):
    name: str | None = None
    color: str | None = None


class SetAnnotations(BaseModel):
    annotations: list[AnnotationIn] = []


class CreateDataset(BaseModel):
    name: str | None = None
    split: str = "80/20"


@router.get("/projects", response_model=list[ProjectOut])
def api_projects(_: UserOut = Depends(current_user)) -> list[ProjectOut]:
    return list_projects()


@router.post("/projects", response_model=ProjectOut)
def api_create_project(req: CreateProject, _: UserOut = Depends(require_editor)) -> ProjectOut:
    return _create_project(req.name)


@router.patch("/projects/{pid}", response_model=ProjectOut)
def api_rename_project(pid: str, req: RenameProject, _: UserOut = Depends(require_editor)) -> ProjectOut:
    _require_project(pid)
    with tx() as conn:
        conn.execute("UPDATE projects SET name=?, updated_at=? WHERE id=?", (req.name.strip(), time.time(), pid))
    return next((p for p in list_projects() if p.id == pid))


@router.delete("/projects/{pid}")
def api_delete_project(pid: str, _: UserOut = Depends(require_editor)) -> dict:
    _require_project(pid)
    # 先删图片文件，再级联删行
    with get_conn() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM images WHERE project_id=?", (pid,)).fetchall()]
    for iid in ids:
        store.remove(iid)
    with tx() as conn:
        conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    return {"ok": True}


@router.get("/projects/{pid}/images", response_model=list[ImageOut])
def api_list_images(pid: str, _: UserOut = Depends(current_user)) -> list[ImageOut]:
    _require_project(pid)
    return list_images(pid)


@router.post("/projects/{pid}/images", response_model=list[ImageOut])
async def api_upload_images(pid: str, files: list[UploadFile] = File(...), _: UserOut = Depends(require_editor)) -> list[ImageOut]:
    _require_project(pid)
    payload = [(f.filename or "image", await f.read()) for f in files]
    return add_images(pid, payload)


@router.delete("/images/{iid}")
def api_delete_image(iid: str, _: UserOut = Depends(require_editor)) -> dict:
    remove_image(iid)
    return {"ok": True}


@router.get("/projects/{pid}/classes", response_model=list[ClassOut])
def api_list_classes(pid: str, _: UserOut = Depends(current_user)) -> list[ClassOut]:
    _require_project(pid)
    return list_classes(pid)


@router.post("/projects/{pid}/classes", response_model=ClassOut)
def api_add_class(pid: str, req: CreateClass, _: UserOut = Depends(require_editor)) -> ClassOut:
    _require_project(pid)
    return add_class(pid, req.name, req.color)


@router.patch("/projects/{pid}/classes/{idx}", response_model=ClassOut)
def api_update_class(pid: str, idx: int, req: UpdateClass, _: UserOut = Depends(require_editor)) -> ClassOut:
    sets, vals = [], []
    if req.name is not None:
        sets.append("name=?"); vals.append(req.name.strip())
    if req.color is not None:
        sets.append("color=?"); vals.append(req.color)
    if not sets:
        raise HTTPException(400, detail="无更新内容")
    vals += [pid, idx]
    with tx() as conn:
        cur = conn.execute(f"UPDATE classes SET {','.join(sets)} WHERE project_id=? AND idx=?", vals)
    if cur.rowcount == 0:
        raise HTTPException(404, detail="类别不存在")
    return next(c for c in list_classes(pid) if c.id == idx)


@router.delete("/projects/{pid}/classes/{idx}")
def api_delete_class(pid: str, idx: int, _: UserOut = Depends(require_editor)) -> dict:
    with tx() as conn:
        conn.execute(
            "DELETE FROM annotations WHERE class_idx=? AND image_id IN (SELECT id FROM images WHERE project_id=?)",
            (idx, pid),
        )
        conn.execute("DELETE FROM classes WHERE project_id=? AND idx=?", (idx, pid))
    return {"ok": True}


@router.get("/images/{iid}/annotations", response_model=list[AnnotationOut])
def api_get_annotations(iid: str, _: UserOut = Depends(current_user)) -> list[AnnotationOut]:
    return get_annotations(iid)


@router.put("/images/{iid}/annotations", response_model=list[AnnotationOut])
def api_set_annotations(iid: str, req: SetAnnotations, _: UserOut = Depends(require_editor)) -> list[AnnotationOut]:
    return set_annotations(iid, req.annotations)


@router.get("/projects/{pid}/datasets", response_model=list[DatasetOut])
def api_list_datasets(pid: str, _: UserOut = Depends(current_user)) -> list[DatasetOut]:
    _require_project(pid)
    return list_datasets(pid)


@router.post("/projects/{pid}/datasets", response_model=DatasetOut)
def api_create_dataset(pid: str, req: CreateDataset, _: UserOut = Depends(require_editor)) -> DatasetOut:
    _require_project(pid)
    return snapshot_dataset(pid, req.name, req.split)
