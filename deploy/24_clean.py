"""上传 kill.sh，脱离 SSH 执行，轮询直到所有 orchestrator/pip 清零（不重启）。"""
from __future__ import annotations

import os
import time

import _ssh

APP = "/opt/labeling-auto"
HERE = os.path.dirname(os.path.abspath(__file__))


def upload(c, local_name, remote):
    local = os.path.join(HERE, local_name)
    with open(local, "r", encoding="utf-8") as f:
        content = f.read().replace("\r\n", "\n")
    tmp = os.path.join(HERE, "_" + local_name + ".lf")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    _ssh.put(c, tmp, remote)
    os.remove(tmp)


c = _ssh.connect_retry()
print("CONNECTED")

upload(c, "kill.sh", "/tmp/kill.sh")
try:
    _ssh.run(
        c,
        "rm -f /tmp/kill_done; setsid bash /tmp/kill.sh </dev/null >/dev/null 2>&1 & echo launched",
        timeout=20,
    )
except Exception as e:
    print("launch killer err", type(e).__name__)
print("killer launched (script-file, no self-match)")

clean = False
for i in range(24):
    time.sleep(5)
    try:
        if c.get_transport() is None or not c.get_transport().is_active():
            c = _ssh.connect_retry()
        rc, out, err = _ssh.run(
            c,
            "d=NO; test -f /tmp/kill_done && d=DONE; "
            "n=$(pgrep -af 'finish_deploy.sh|pip install' | grep -v pgrep | grep -v 'kill.sh' | wc -l); "
            "echo \"$d n=$n\"",
            timeout=30,
        )
        print(f"  [{i}] {out.strip()}")
        if "DONE" in out and "n=0" in out:
            clean = True
            break
    except Exception as e:
        print("  check err", type(e).__name__)
        try:
            c = _ssh.connect_retry()
        except Exception:
            pass

print("\nRESULT:", "CLEAN" if clean else "NOT CLEAN")
# 最后再列一次进程，便于核对
try:
    rc, out, err = _ssh.run(c, "pgrep -af 'finish_deploy.sh|pip install'|grep -v pgrep || echo none", timeout=30)
    _ssh.show("remaining procs", rc, out, err)
except Exception as e:
    print("final check err", type(e).__name__)
c.close()
