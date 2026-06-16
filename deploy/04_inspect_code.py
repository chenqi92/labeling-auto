"""拉取模型自定义代码（trust_remote_code 的 .py），检查是否在顶层硬 import 重依赖
（decord / cv2 / flash_attn / triton 等），以决定 Python 版本与依赖集。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()
EP = "https://hf-mirror.com"
MODEL = "nvidia/LocateAnything-3B"

# 1) 列出仓库文件
rc, out, err = _ssh.run(
    c,
    f"curl -s -m 30 {EP}/api/models/{MODEL}/tree/main "
    "| grep -oE '\"path\":\"[^\"]+\"' | sed 's/\"path\":\"//;s/\"//'",
    timeout=60,
)
_ssh.show("repo files", rc, out, err)
py_files = [ln.strip() for ln in out.splitlines() if ln.strip().endswith(".py")]
print("PY FILES:", py_files)

# 2) 逐个 .py 拉下来，看前 60 行的 import，以及全文是否出现 decord/cv2 等
risky = "decord|cv2|flash_attn|flashattn|triton|magi|av\\b|moviepy|ffmpeg"
for f in py_files:
    rc, out, err = _ssh.run(
        c,
        f"curl -sL -m 30 {EP}/{MODEL}/resolve/main/{f} -o /tmp/m.py 2>/dev/null; "
        "echo '--- top imports ---'; "
        "grep -nE '^[[:space:]]*(import|from)[[:space:]]' /tmp/m.py | head -40; "
        f"echo '--- risky matches (any line) ---'; grep -nE '({risky})' /tmp/m.py | head -20",
        timeout=60,
    )
    _ssh.show(f"{f}", rc, out, err)

c.close()
print("\nINSPECT DONE")
