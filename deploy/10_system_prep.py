"""系统准备：装 pip/venv/dev/build 工具，建 /opt/labeling-auto 目录并 chown 给部署用户。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

print("\n>>> apt update + install python3-pip python3-venv python3-dev build-essential ...")
rc, out, err = _ssh.sudo(
    c,
    "export DEBIAN_FRONTEND=noninteractive; "
    "apt-get update -y >/tmp/apt.log 2>&1; "
    "apt-get install -y python3-pip python3-venv python3-dev build-essential pkg-config >>/tmp/apt.log 2>&1; "
    "echo RC=$?; tail -5 /tmp/apt.log",
    timeout=600,
)
_ssh.show("apt install", rc, out, err)

print("\n>>> create /opt/labeling-auto ...")
rc, out, err = _ssh.sudo(
    c,
    f"mkdir -p /opt/labeling-auto && chown -R {_ssh.USER}:{_ssh.USER} /opt/labeling-auto && "
    "ls -ld /opt/labeling-auto",
)
_ssh.show("mkdir app dir", rc, out, err)

# 校验 pip/venv 现在可用
rc, out, err = _ssh.run(
    c,
    "python3 --version; python3 -m pip --version 2>&1; "
    "python3 -c 'import ensurepip; print(\"ensurepip ok\")' 2>&1",
)
_ssh.show("verify pip/venv", rc, out, err)

c.close()
print("\nSYSTEM PREP DONE")
