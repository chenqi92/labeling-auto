"""确认 torch (cu128) 对哪些 CPython 版本有 wheel，以及 system python 能否 ensurepip。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()

rc, out, err = _ssh.run(c, "python3 -c 'import ensurepip; print(\"ensurepip ok\")' 2>&1")
_ssh.show("ensurepip available?", rc, out, err)

# torch cu128 各 CPython 版本可用情况
rc, out, err = _ssh.run(
    c,
    "curl -s -m 40 https://download.pytorch.org/whl/cu128/torch/ "
    "| grep -oE 'cp3[0-9]+-cp3[0-9]+[a-z]*-(manylinux|linux)[^\"]*' "
    "| grep -oE 'cp3[0-9]+' | sort -u",
    timeout=60,
)
_ssh.show("torch cu128: available cpXY tags", rc, out, err)

# 具体看 cp312 / cp314 的 linux x86_64 wheel 文件名（取最新若干）
for tag in ("cp312", "cp314"):
    rc, out, err = _ssh.run(
        c,
        f"curl -s -m 40 https://download.pytorch.org/whl/cu128/torch/ "
        f"| grep -oE 'torch-[0-9][^\"]*{tag}-{tag}[a-z]*-(manylinux|linux)_[^\"]*\\.whl' "
        f"| tail -5",
        timeout=60,
    )
    _ssh.show(f"torch cu128 {tag} wheels (last 5)", rc, out, err)

# torchvision 同理（cp312）
rc, out, err = _ssh.run(
    c,
    "curl -s -m 40 https://download.pytorch.org/whl/cu128/torchvision/ "
    "| grep -oE 'cp3[0-9]+' | sort -u",
    timeout=60,
)
_ssh.show("torchvision cu128: available cpXY", rc, out, err)

c.close()
print("\nWHEEL PROBE DONE")
