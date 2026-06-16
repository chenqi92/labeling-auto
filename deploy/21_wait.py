"""轮询服务器 deploy_status.log，直到出现指定标记 / FAILED / 超时后退出。
用作本地后台任务：退出即触发助手继续。用法: 21_wait.py <MARKER> [max_minutes]"""
from __future__ import annotations

import sys
import time

import _ssh

MARKER = sys.argv[1] if len(sys.argv) > 1 else "DEPS_OK"
MAXMIN = int(sys.argv[2]) if len(sys.argv) > 2 else 75
APP = "/opt/labeling-auto"

deadline = time.time() + MAXMIN * 60
last = ""
while time.time() < deadline:
    try:
        c = _ssh.connect()
        rc, out, err = _ssh.run(
            c,
            f"echo '== status =='; tail -6 {APP}/deploy_status.log 2>/dev/null; "
            f"echo '== torch dl =='; tail -1 {APP}/install_torch.log 2>/dev/null; "
            f"echo '== model dl =='; du -sh {APP}/models/LocateAnything-3B 2>/dev/null || echo 'no model yet'",
            timeout=30,
        )
        c.close()
        if out != last:
            print(f"[{time.strftime('%H:%M:%S')}]\n{out.strip()}\n", flush=True)
            last = out
        if "FAILED" in out:
            print("RESULT=FAILED", flush=True)
            sys.exit(1)
        if MARKER in out:
            print(f"RESULT={MARKER}", flush=True)
            sys.exit(0)
    except Exception as e:  # noqa: BLE001
        print(f"[{time.strftime('%H:%M:%S')}] poll error: {type(e).__name__}", flush=True)
    time.sleep(45)

print("RESULT=TIMEOUT", flush=True)
sys.exit(2)
