"""上传最新 finish_deploy.sh，启动单一 orchestrator，确认只有一个在跑。"""
from __future__ import annotations

import os

import _ssh

APP = "/opt/labeling-auto"
HERE = os.path.dirname(os.path.abspath(__file__))

c = _ssh.connect_retry()
print("CONNECTED")

# 先确认确实没有残留
rc, out, err = _ssh.run(c, "pgrep -af 'finish_deploy.sh|pip install'|grep -v pgrep||echo none", timeout=30)
_ssh.show("preflight (expect none)", rc, out, err)

# 上传脚本
local = os.path.join(HERE, "finish_deploy.sh")
with open(local, "r", encoding="utf-8") as f:
    content = f.read().replace("\r\n", "\n")
tmp = os.path.join(HERE, "_fd.lf")
with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
_ssh.put(c, tmp, f"{APP}/finish_deploy.sh")
os.remove(tmp)

# 缓存现状
rc, out, err = _ssh.run(c, "du -sh ~/.cache/pip 2>/dev/null|cut -f1||echo 0", timeout=30)
_ssh.show("pip cache size", rc, out, err)

# 启动单一 orchestrator
rc, out, err = _ssh.run(
    c,
    f"rm -f {APP}/deploy_status.log; chmod +x {APP}/finish_deploy.sh; "
    f"setsid bash -c 'nohup bash {APP}/finish_deploy.sh >{APP}/finish_deploy.out 2>&1 </dev/null &'; "
    "sleep 3; echo '--- procs (expect 1 orchestrator + maybe its pip) ---'; "
    "pgrep -af 'finish_deploy.sh|pip install'|grep -v pgrep; "
    f"echo '--- status ---'; cat {APP}/deploy_status.log",
    timeout=40,
)
_ssh.show("launch single", rc, out, err)

c.close()
print("\nSINGLE ORCHESTRATOR LAUNCHED")
