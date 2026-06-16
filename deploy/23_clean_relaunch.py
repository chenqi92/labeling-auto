"""彻底清理（脱离 SSH 的 killer，断连也能杀干净）→ 确认无残留 → 重启单一 orchestrator。"""
from __future__ import annotations

import os
import time

import _ssh

APP = "/opt/labeling-auto"
HERE = os.path.dirname(os.path.abspath(__file__))


def run_retry(c_holder, cmd, timeout=40, tries=4):
    for _ in range(tries):
        try:
            c = c_holder[0]
            return _ssh.run(c, cmd, timeout=timeout)
        except Exception:
            try:
                c_holder[0].close()
            except Exception:
                pass
            c_holder[0] = _ssh.connect_retry()
    raise RuntimeError("run_retry exhausted")


ch = [_ssh.connect_retry()]
print("CONNECTED")

# 1) 脱离 SSH 的 killer：循环 kill 所有 pip + orchestrator，再卸载半成品 torch
killer = (
    "setsid bash -c '"
    "for i in $(seq 1 8); do "
    "pkill -9 -f \"pip install\" 2>/dev/null; "
    "pkill -9 -f finish_deploy.sh 2>/dev/null; "
    "sleep 2; done; "
    f"{APP}/.venv/bin/pip uninstall -y torch torchvision >/dev/null 2>&1; "
    "touch /tmp/kill_done' </dev/null >/dev/null 2>&1 &"
)
run_retry(ch, f"rm -f /tmp/kill_done; {killer} echo killer_launched", timeout=30)
print("killer launched (detached)")

# 2) 等待清理完成 + 确认无残留
clean = False
for _ in range(20):
    time.sleep(5)
    try:
        rc, out, err = run_retry(
            ch,
            "test -f /tmp/kill_done && echo DONE; "
            "pgrep -af 'pip install|finish_deploy.sh' | grep -v grep | wc -l",
            timeout=30,
        )
        print("check:", out.replace("\n", " ").strip())
        lines = out.strip().splitlines()
        done = any("DONE" in l for l in lines)
        nproc = lines[-1].strip() if lines else "?"
        if done and nproc == "0":
            clean = True
            break
    except Exception as e:
        print("check err", type(e).__name__)

print("CLEAN" if clean else "WARNING: not confirmed clean")

# 3) 上传最新脚本 + 重启单一 orchestrator
local = os.path.join(HERE, "finish_deploy.sh")
with open(local, "r", encoding="utf-8") as f:
    content = f.read().replace("\r\n", "\n")
tmp = os.path.join(HERE, "_fd.lf.sh")
with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
_ssh.put(ch[0], tmp, f"{APP}/finish_deploy.sh")
os.remove(tmp)

rc, out, err = run_retry(
    ch,
    f"rm -f {APP}/deploy_status.log; chmod +x {APP}/finish_deploy.sh; "
    f"setsid bash -c 'nohup bash {APP}/finish_deploy.sh >{APP}/finish_deploy.out 2>&1 </dev/null &'; "
    "sleep 2; echo '--- procs ---'; pgrep -af 'pip install|finish_deploy.sh'|grep -v grep; "
    f"echo '--- status ---'; cat {APP}/deploy_status.log",
    timeout=40,
)
_ssh.show("relaunch (single)", rc, out, err)

ch[0].close()
print("\nCLEAN RELAUNCH DONE")
