"""上传自驱部署脚本并以 setsid+nohup 脱离 SSH 启动（断连不受影响）。"""
from __future__ import annotations

import os

import _ssh

APP = "/opt/labeling-auto"
HERE = os.path.dirname(os.path.abspath(__file__))

c = _ssh.connect_retry()
print("CONNECTED")

# 上传脚本（统一 LF 行尾）
local = os.path.join(HERE, "finish_deploy.sh")
with open(local, "r", encoding="utf-8") as f:
    content = f.read().replace("\r\n", "\n")
tmp = os.path.join(HERE, "_finish_deploy.lf.sh")
with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
_ssh.put(c, tmp, f"{APP}/finish_deploy.sh")
os.remove(tmp)

# 清掉旧状态，detached 启动
rc, out, err = _ssh.run(
    c,
    f"rm -f {APP}/deploy_status.log; chmod +x {APP}/finish_deploy.sh; "
    f"setsid bash -c 'nohup bash {APP}/finish_deploy.sh >{APP}/finish_deploy.out 2>&1 </dev/null &'; "
    "sleep 1; echo launched; pgrep -af finish_deploy.sh | grep -v grep | head -2",
    timeout=40,
)
_ssh.show("launch", rc, out, err)

c.close()
print("\nLAUNCHED (detached). 用 21_poll.py 查看进度。")
