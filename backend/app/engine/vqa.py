"""视觉问答（状态判断 / 巡检 + 文字识别）引擎：经本机 Ollama 调视觉语言模型(VLM)。

模型由 settings.vqa_model 指定（默认 qwen3.5:9b-q8_0，也可换 qwen2.5vl 等任意带 vision 能力的 Ollama 模型）。

与 LocateAnything 检测分离：
- 本进程**不加载**任何 VLM 权重，仅通过 HTTP 调用 Ollama（默认 127.0.0.1:11434）。
- Ollama 按 keep_alive 空闲自动卸载，天然实现「按需加载、用完释放显存」，
  不与常驻的 LocateAnything 抢占显存峰值。
- 用 Ollama 的「JSON schema 结构化输出」（format 传 schema）强制返回固定形状，便于解析。
"""
from __future__ import annotations

import base64
import io
import json
import time
import urllib.error
import urllib.request

from PIL import Image

from app.config import settings

# 系统提示：只依据图片、给确定的三态答案，避免模型展开长篇主观描述
_SYSTEM = (
    "你是工业巡检视觉助手。只依据图片内容回答，看不清或无法判断时答「不确定」，不要臆测。"
    "对每个问题给出 answer（必须是 是 / 否 / 不确定 三者之一）与 detail（一句简短中文依据）。"
)

# 强制输出形状（Ollama structured outputs）
_FORMAT_SCHEMA = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": "string", "enum": ["是", "否", "不确定"]},
                    "detail": {"type": "string"},
                },
                "required": ["question", "answer", "detail"],
            },
        }
    },
    "required": ["answers"],
}


class VQAError(RuntimeError):
    """Ollama 不可达 / 模型未拉取 / 超时等。"""


def _encode_image(image_bytes: bytes) -> str:
    """缩到长边 <= vqa_max_image_side，转 JPEG 后 base64，减小传输与推理开销。"""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    side = settings.vqa_max_image_side
    if side and max(img.width, img.height) > side:
        scale = side / max(img.width, img.height)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _post(path: str, payload: dict, timeout: float) -> dict:
    url = f"{settings.ollama_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 模型未拉取等 → Ollama 返回 4xx/5xx
        body = e.read().decode("utf-8", "ignore")
        raise VQAError(f"Ollama HTTP {e.code}: {body[:200]}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise VQAError(f"无法连接 Ollama（{settings.ollama_url}）：{e}") from e


def inspect(image_bytes: bytes, questions: list[str]) -> tuple[list[dict], str]:
    """对一张图回答一组是非问题。返回 (answers, raw_text)。

    answers: [{"question","answer","detail"}, ...]，长度尽量对齐输入问题。
    """
    b64 = _encode_image(image_bytes)
    q_lines = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
    prompt = (
        "请逐条回答下列关于图中目标的判断题，对每条都要给出 answer 和 detail：\n"
        f"{q_lines}"
    )
    payload = {
        "model": settings.vqa_model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt, "images": [b64]},
        ],
        "stream": False,
        "format": _FORMAT_SCHEMA,
        "keep_alive": settings.vqa_keep_alive,
        "options": {"temperature": 0.0, "num_predict": settings.vqa_max_new_tokens},
    }
    out = _post("/api/chat", payload, timeout=settings.vqa_timeout)
    raw = (out.get("message") or {}).get("content", "") or ""

    answers = _parse(raw, questions)
    return answers, raw


def recognize_text(image_bytes: bytes) -> tuple[str, str]:
    """整图文字识别（OCR）。返回 (text, raw)。

    与 LocateAnything 的「文字检测」不同：这里输出**文字内容**而非坐标框。
    """
    b64 = _encode_image(image_bytes)
    prompt = (
        "请识别这张图片中的所有文字，按自然阅读顺序（从上到下、从左到右）输出纯文本，"
        "保留原有的换行与分段。只输出文字本身，不要加任何解释、翻译或标注。若图中没有文字，则输出空。"
    )
    payload = {
        "model": settings.vqa_model,
        "messages": [{"role": "user", "content": prompt, "images": [b64]}],
        "stream": False,
        "keep_alive": settings.vqa_keep_alive,
        "options": {"temperature": 0.0, "num_predict": 1024},
    }
    out = _post("/api/chat", payload, timeout=settings.vqa_timeout)
    text = ((out.get("message") or {}).get("content", "") or "").strip()
    return text, text


def _parse(raw: str, questions: list[str]) -> list[dict]:
    """解析模型 JSON；失败则兜底为每题「不确定」。对齐问题文本。"""
    items: list[dict] = []
    try:
        obj = json.loads(raw)
        items = obj.get("answers") if isinstance(obj, dict) else []
        if not isinstance(items, list):
            items = []
    except (json.JSONDecodeError, TypeError):
        items = []

    norm: list[dict] = []
    for i, q in enumerate(questions):
        src = items[i] if i < len(items) and isinstance(items[i], dict) else {}
        ans = str(src.get("answer", "")).strip()
        if ans not in ("是", "否", "不确定"):
            ans = "不确定"
        norm.append(
            {
                "question": str(src.get("question") or q),
                "answer": ans,
                "detail": str(src.get("detail", "")).strip(),
            }
        )
    # 模型若多答了（少见），附带保留
    for extra in items[len(questions):]:
        if isinstance(extra, dict) and extra.get("question"):
            a = str(extra.get("answer", "")).strip()
            norm.append(
                {
                    "question": str(extra["question"]),
                    "answer": a if a in ("是", "否", "不确定") else "不确定",
                    "detail": str(extra.get("detail", "")).strip(),
                }
            )
    return norm


def unload(timeout: float = 25.0) -> None:
    """卸载 VQA 模型，并**等到其显存真正释放**后再返回。

    用于检测前腾出显存给 LocateAnything。关键：Ollama 收到 keep_alive=0 后是
    异步卸载（runner 进程退出 + 释放 CUDA 需 1~2 秒），若不等待就加载 LA 会撞 OOM。
    这里发出 keep_alive=0 后轮询 /api/ps，直到该模型不在已加载列表中再返回。
    Ollama 不在线 / 模型本就未加载时静默返回，不阻塞。
    """
    try:
        _post("/api/generate", {"model": settings.vqa_model, "keep_alive": 0}, timeout=15)
    except Exception:  # noqa: BLE001
        pass
    base = settings.ollama_url.rstrip("/")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base}/api/ps", timeout=5) as resp:
                models = json.loads(resp.read().decode("utf-8")).get("models", [])
        except Exception:  # noqa: BLE001
            return  # Ollama 不可达，不阻塞检测
        loaded = [(m.get("model") or m.get("name") or "") for m in models]
        if settings.vqa_model not in loaded:
            time.sleep(0.6)  # 给 runner 退出 + CUDA 释放留一点缓冲
            return
        time.sleep(0.5)


def health() -> dict:
    """探测 Ollama 是否在线、目标模型是否已拉取。"""
    try:
        url = f"{settings.ollama_url.rstrip('/')}/api/tags"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        names = [m.get("name", "") for m in data.get("models", [])]
        return {"ok": True, "model_ready": settings.vqa_model in names, "models": names}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "model_ready": False, "error": str(e)}
