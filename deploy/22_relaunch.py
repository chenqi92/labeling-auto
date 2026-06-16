"""停掉旧的卡住的 orchestrator/pip，上传新版 finish_deploy.sh，重新脱离 SSH 启动。"""
from __future__ import annotations

import os

import _ssh

APP = "/opt/labeling-auto"
HERE = os.path.dirname(os.path.abspath(__file__))

c = _ssh.connect_retry()
print("CONNECTED")

# 1) 硬杀所有 orchestrator + pip（含被孤立的 pip 子进程），清掉可能装了一半的 CPU 版 torch
rc, out, err = _ssh.run(
    c,
    "pkill -9 -f finish_deploy.sh 2>/dev/null; pkill -9 -f 'pip install' 2>/dev/null; "
    "sleep 3; "
    "/opt/labeling-auto/.venv/bin/pip uninstall -y torch torchvision >/dev/null 2>&1; "
    "echo '--- remaining procs ---'; "
    "pgrep -af 'finish_deploy.sh|pip install' | grep -v grep || echo 'all stopped'",
    timeout=60,
)
_ssh.show("hard kill old", rc, out, err)

# 2) 上传新脚本（LF 行尾）
local = os.path.join(HERE, "finish_deploy.sh")
with open(local, "r", encoding="utf-8") as f:
    content = f.read().replace("\r\n", "\n")
tmp = os.path.join(HERE, "_fd.lf.sh")
with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
_ssh.put(c, tmp, f"{APP}/finish_deploy.sh")
os.remove(tmp)
print("uploaded new finish_deploy.sh")

# 3) 重新 detached 启动
rc, out, err = _ssh.run(
    c,
    f"rm -f {APP}/deploy_status.log; chmod +x {APP}/finish_deploy.sh; "
    f"setsid bash -c 'nohup bash {APP}/finish_deploy.sh >{APP}/finish_deploy.out 2>&1 </dev/null &'; "
    "sleep 2; pgrep -af finish_deploy.sh | grep -v grep | head -1; "
    f"echo '--- status ---'; cat {APP}/deploy_status.log 2>/dev/null",
    timeout=40,
)
_ssh.show("relaunch", rc, out, err)

c.close()
print("\nRELAUNCHED")
