"""SQLite 持久化层（纯标准库，无额外依赖）。

整个站点的持久化数据（用户/会话/项目/数据集/标注/任务/模型注册等）都落在单个
SQLite 文件里。各阶段按需在 SCHEMA 增表；init_db() 幂等执行，启动时调用一次。

并发：开启 WAL，多读单写；每次操作开一个新连接（connect() 轻量），写操作走 tx()
上下文自动提交。FastAPI/uvicorn 多线程下用 check_same_thread=False。
"""
from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from app.config import settings

_init_lock = threading.Lock()
_initialized = False


def db_path() -> str:
    p = settings.db_path or os.path.join(settings.data_dir, "app.db")
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    return p


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=8000")
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """只读 / 一次性查询用：拿一个连接，用完即关。"""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    """写事务：成功提交，异常回滚。"""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# 各表 DDL；新增模块在这里追加建表语句即可（IF NOT EXISTS，幂等）。
SCHEMA: list[str] = [
    # —— 账户 ——
    """
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL DEFAULT '',
        role        TEXT NOT NULL DEFAULT 'user',   -- admin | user | guest
        pw_salt     TEXT NOT NULL,
        pw_hash     TEXT NOT NULL,
        created_at  REAL NOT NULL,
        last_active REAL NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        token       TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        created_at  REAL NOT NULL,
        expires_at  REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """,
    # —— 项目 / 数据集 / 标注 ——
    """
    CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  REAL NOT NULL,
        updated_at  REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS images (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        filename    TEXT NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'todo',   -- todo | done | reviewed
        created_at  REAL NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id)",
    """
    CREATE TABLE IF NOT EXISTS classes (
        project_id  TEXT NOT NULL,
        idx         INTEGER NOT NULL,               -- 项目内类别序号（= YOLO class_id）
        name        TEXT NOT NULL,
        color       TEXT NOT NULL,
        PRIMARY KEY (project_id, idx),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS annotations (
        id          TEXT PRIMARY KEY,
        image_id    TEXT NOT NULL,
        class_idx   INTEGER NOT NULL,
        x1 REAL, y1 REAL, x2 REAL, y2 REAL,         -- 原图像素坐标
        score       REAL,
        source      TEXT NOT NULL DEFAULT 'manual', -- auto | manual
        created_at  REAL NOT NULL,
        FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_anns_image ON annotations(image_id)",
    """
    CREATE TABLE IF NOT EXISTS dataset_versions (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        sample_count  INTEGER NOT NULL,
        class_count   INTEGER NOT NULL,
        box_count     INTEGER NOT NULL DEFAULT 0,
        split         TEXT NOT NULL DEFAULT '80/20',
        created_at    REAL NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """,
]


def init_db() -> None:
    """建表 + 播种管理员。幂等，可重复调用。"""
    global _initialized
    with _init_lock:
        if _initialized:
            return
        with tx() as conn:
            for ddl in SCHEMA:
                conn.execute(ddl)
        _initialized = True
    # 播种放在建表之后，避免循环 import 放这里调用
    from app import auth, projects
    auth.seed_admin()
    projects.seed_default()
