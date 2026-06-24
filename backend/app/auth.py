"""真实账户与会话鉴权（纯标准库）。

- 密码：pbkdf2_hmac(sha256) + 每用户随机盐，存 hex。
- 会话：登录换取不透明随机令牌，存 sessions 表，按 Authorization: Bearer <token> 鉴权。
- 角色：admin | user | guest。管理员可增删用户 / 改角色 / 重置密码。
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db import get_conn, tx

ROLES = ("admin", "user", "guest")
ROLE_LABELS = {"admin": "管理员", "user": "标注员", "guest": "只读访客"}
_PBKDF2_ROUNDS = 200_000


# ---------------- 密码 ----------------
def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ROUNDS)
    return salt, dk.hex()


def verify_password(password: str, salt: str, expected_hex: str) -> bool:
    _, got = hash_password(password, salt)
    return hmac.compare_digest(got, expected_hex)


# ---------------- Schemas ----------------
class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    name: str
    role: str
    role_label: str = ""
    last_active: float = 0
    online: bool = False


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class CreateUserRequest(BaseModel):
    username: str
    password: str
    name: str = ""
    role: str = "user"


class UpdateUserRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    password: str | None = None


# ---------------- 行 → 模型 ----------------
def _row_to_user(row) -> UserOut:
    return UserOut(
        id=row["id"],
        username=row["username"],
        name=row["name"],
        role=row["role"],
        role_label=ROLE_LABELS.get(row["role"], row["role"]),
        last_active=row["last_active"] or 0,
        online=(time.time() - (row["last_active"] or 0)) < 300,
    )


# ---------------- 用户 CRUD ----------------
def create_user(username: str, password: str, name: str = "", role: str = "user") -> UserOut:
    if role not in ROLES:
        raise HTTPException(400, detail=f"非法角色：{role}")
    salt, pw = hash_password(password)
    now = time.time()
    try:
        with tx() as conn:
            cur = conn.execute(
                "INSERT INTO users(username,name,role,pw_salt,pw_hash,created_at,last_active)"
                " VALUES(?,?,?,?,?,?,0)",
                (username.strip(), name.strip() or username.strip(), role, salt, pw, now),
            )
            uid = cur.lastrowid
            row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    except Exception as e:  # noqa: BLE001
        if "UNIQUE" in str(e):
            raise HTTPException(409, detail="账号已存在")
        raise
    return _row_to_user(row)


def list_users() -> list[UserOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    return [_row_to_user(r) for r in rows]


def count_users() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]


def update_user(uid: int, req: UpdateUserRequest) -> UserOut:
    sets, vals = [], []
    if req.name is not None:
        sets.append("name=?"); vals.append(req.name.strip())
    if req.role is not None:
        if req.role not in ROLES:
            raise HTTPException(400, detail=f"非法角色：{req.role}")
        sets.append("role=?"); vals.append(req.role)
    if req.password:
        salt, pw = hash_password(req.password)
        sets += ["pw_salt=?", "pw_hash=?"]; vals += [salt, pw]
    if not sets:
        raise HTTPException(400, detail="无更新内容")
    vals.append(uid)
    with tx() as conn:
        conn.execute(f"UPDATE users SET {','.join(sets)} WHERE id=?", vals)
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if row is None:
        raise HTTPException(404, detail="用户不存在")
    return _row_to_user(row)


def delete_user(uid: int) -> None:
    with tx() as conn:
        cur = conn.execute("DELETE FROM users WHERE id=?", (uid,))
    if cur.rowcount == 0:
        raise HTTPException(404, detail="用户不存在")


# ---------------- 会话 ----------------
def login(username: str, password: str) -> LoginResponse:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username.strip(),)).fetchone()
    if row is None or not verify_password(password, row["pw_salt"], row["pw_hash"]):
        raise HTTPException(401, detail="账号或密码错误")
    token = secrets.token_urlsafe(32)
    now = time.time()
    exp = now + settings.auth_token_ttl_days * 86400
    with tx() as conn:
        conn.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                     (token, row["id"], now, exp))
        conn.execute("UPDATE users SET last_active=? WHERE id=?", (now, row["id"]))
    user = _row_to_user(row)
    user.last_active = now
    user.online = True
    return LoginResponse(token=token, user=user)


def logout(token: str) -> None:
    with tx() as conn:
        conn.execute("DELETE FROM sessions WHERE token=?", (token,))


def user_for_token(token: str) -> UserOut | None:
    now = time.time()
    with get_conn() as conn:
        srow = conn.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if srow is None or srow["expires_at"] < now:
            return None
        urow = conn.execute("SELECT * FROM users WHERE id=?", (srow["user_id"],)).fetchone()
    if urow is None:
        return None
    with tx() as conn:
        conn.execute("UPDATE users SET last_active=? WHERE id=?", (now, urow["id"]))
    user = _row_to_user(urow)
    user.last_active = now
    user.online = True
    return user


def seed_admin() -> None:
    """首次启动且无任何用户时，播种默认管理员。"""
    if count_users() > 0:
        return
    create_user(settings.default_admin_user, settings.default_admin_password,
                settings.default_admin_name, "admin")


# ---------------- FastAPI 依赖 ----------------
def _token_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


def current_user(authorization: str | None = Header(default=None)) -> UserOut:
    token = _token_from_header(authorization)
    user = user_for_token(token) if token else None
    if user is None:
        raise HTTPException(401, detail="未登录或会话已过期")
    return user


def optional_user(authorization: str | None = Header(default=None)) -> UserOut | None:
    token = _token_from_header(authorization)
    return user_for_token(token) if token else None


def require_admin(user: UserOut = Depends(current_user)) -> UserOut:
    if user.role != "admin":
        raise HTTPException(403, detail="需要管理员权限")
    return user


def require_editor(user: UserOut = Depends(current_user)) -> UserOut:
    """写操作：访客只读。"""
    if user.role == "guest":
        raise HTTPException(403, detail="只读访客无操作权限")
    return user


# ---------------- 路由 ----------------
router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login", response_model=LoginResponse)
def api_login(req: LoginRequest) -> LoginResponse:
    return login(req.username, req.password)


@router.post("/auth/logout")
def api_logout(authorization: str | None = Header(default=None)) -> dict:
    token = _token_from_header(authorization)
    if token:
        logout(token)
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def api_me(user: UserOut = Depends(current_user)) -> UserOut:
    return user


@router.get("/users", response_model=list[UserOut])
def api_list_users(_: UserOut = Depends(require_admin)) -> list[UserOut]:
    return list_users()


@router.post("/users", response_model=UserOut)
def api_create_user(req: CreateUserRequest, _: UserOut = Depends(require_admin)) -> UserOut:
    return create_user(req.username, req.password, req.name, req.role)


@router.patch("/users/{uid}", response_model=UserOut)
def api_update_user(uid: int, req: UpdateUserRequest, admin: UserOut = Depends(require_admin)) -> UserOut:
    return update_user(uid, req)


@router.delete("/users/{uid}")
def api_delete_user(uid: int, admin: UserOut = Depends(require_admin)) -> dict:
    if uid == admin.id:
        raise HTTPException(400, detail="不能删除当前登录的管理员")
    delete_user(uid)
    return {"ok": True}
