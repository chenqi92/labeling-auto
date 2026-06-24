"""上传图片的存储。内存索引 + 磁盘落地 + JSON 索引，使服务重启（如 --reload）后仍能取回图片。"""
from __future__ import annotations

import io
import json
import os
import threading
import uuid
from dataclasses import dataclass

from PIL import Image, ImageOps

from app.config import settings


@dataclass
class StoredImage:
    id: str
    filename: str
    path: str
    width: int
    height: int
    content_type: str


class ImageStore:
    def __init__(self, data_dir: str | None = None) -> None:
        base = data_dir or settings.data_dir
        self._dir = os.path.join(base, "uploads")
        os.makedirs(self._dir, exist_ok=True)
        self._index_path = os.path.join(self._dir, "_index.json")
        self._items: dict[str, StoredImage] = {}
        self._lock = threading.Lock()
        self._load_index()

    # —— 持久化索引 ——
    def _load_index(self) -> None:
        if not os.path.exists(self._index_path):
            return
        try:
            with open(self._index_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            return
        for rec in raw.get("images", []):
            fname = rec.get("file")
            path = os.path.join(self._dir, fname) if fname else rec.get("path", "")
            if not path or not os.path.exists(path):
                continue  # 文件已不在，跳过
            self._items[rec["id"]] = StoredImage(
                id=rec["id"],
                filename=rec.get("filename", os.path.basename(path)),
                path=path,
                width=int(rec.get("width", 0)),
                height=int(rec.get("height", 0)),
                content_type=rec.get("content_type", "image/png"),
            )

    def _save_index(self) -> None:
        images = [
            {
                "id": it.id,
                "filename": it.filename,
                "file": os.path.basename(it.path),
                "width": it.width,
                "height": it.height,
                "content_type": it.content_type,
            }
            for it in self._items.values()
        ]
        tmp = self._index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"images": images}, f, ensure_ascii=False)
        os.replace(tmp, self._index_path)

    # —— 增删查 ——
    def add(self, filename: str, data: bytes, content_type: str = "") -> StoredImage:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # 按 EXIF 方向校正
        if img.mode != "RGB":
            img = img.convert("RGB")

        img_id = uuid.uuid4().hex
        stem, _ = os.path.splitext(os.path.basename(filename) or "image")
        safe_stem = _sanitize(stem) or "image"
        path = os.path.join(self._dir, f"{img_id}.png")
        img.save(path, format="PNG")

        item = StoredImage(
            id=img_id,
            filename=f"{safe_stem}.png",
            path=path,
            width=img.width,
            height=img.height,
            content_type="image/png",
        )
        with self._lock:
            self._items[img_id] = item
            self._save_index()
        return item

    def remove(self, img_id: str) -> bool:
        with self._lock:
            item = self._items.pop(img_id, None)
            if item is None:
                return False
            try:
                os.remove(item.path)
            except OSError:
                pass
            self._save_index()
            return True

    def get(self, img_id: str) -> StoredImage | None:
        return self._items.get(img_id)

    def all(self) -> list[StoredImage]:
        return list(self._items.values())

    def get_pil(self, img_id: str) -> Image.Image:
        item = self._require(img_id)
        return Image.open(item.path).convert("RGB")

    def get_bytes(self, img_id: str) -> bytes:
        item = self._require(img_id)
        with open(item.path, "rb") as f:
            return f.read()

    def _require(self, img_id: str) -> StoredImage:
        item = self._items.get(img_id)
        if item is None:
            raise KeyError(img_id)
        return item


def _sanitize(name: str) -> str:
    keep = "-_."
    return "".join(c for c in name if c.isalnum() or c in keep).strip("._")


# 进程级单例
store = ImageStore()
