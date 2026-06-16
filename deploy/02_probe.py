"""探测部署所需的下载源可达性、模型是否 gated、防火墙、80 端口占用。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")


def code(url: str, m: int = 20) -> str:
    return f"curl -s -m {m} -o /dev/null -w '%{{http_code}} t=%{{time_total}}s' {url} 2>&1 || echo FAILED"


checks = [
    ("hf-mirror model config", code("https://hf-mirror.com/nvidia/LocateAnything-3B/resolve/main/config.json")),
    ("hf-mirror root", code("https://hf-mirror.com")),
    ("direct hf model config", code("https://huggingface.co/nvidia/LocateAnything-3B/resolve/main/config.json", 15)),
    ("pytorch cu128 index", code("https://download.pytorch.org/whl/cu128/")),
    ("pytorch cu130 index", code("https://download.pytorch.org/whl/cu130/")),
    ("astral uv installer", code("https://astral.sh/uv/install.sh")),
    ("github", code("https://github.com")),
    ("tsinghua pypi mirror", code("https://pypi.tuna.tsinghua.edu.cn/simple/")),
    ("docker?", "which docker && docker --version 2>&1 || echo 'no docker'"),
]
for label, cmd in checks:
    rc, out, err = _ssh.run(c, cmd, timeout=40)
    _ssh.show(label, rc, out, err)

# 防火墙 + 80 端口占用 + 模型文件清单
rc, out, err = _ssh.sudo(c, "ufw status verbose 2>&1 | head -15 || echo 'no ufw'")
_ssh.show("ufw status", rc, out, err)
rc, out, err = _ssh.sudo(c, "ss -ltnp 2>/dev/null | grep ':80 '")
_ssh.show("who owns :80", rc, out, err)

# 列出模型仓库文件大小（经镜像），估算下载量
rc, out, err = _ssh.run(
    c,
    "curl -s -m 25 https://hf-mirror.com/api/models/nvidia/LocateAnything-3B 2>&1 | head -c 1500",
    timeout=40,
)
_ssh.show("model meta (mirror api)", rc, out, err)

c.close()
print("\nPROBE DONE")
