"""远端配置 VQA（状态检测/巡检 + 文字识别）：拉取 Ollama 视觉模型 + 注入服务环境变量。

凭据从环境变量读取（见 _ssh.py：LA_DEPLOY_HOST/USER/PASS）。模型名用 LA_VQA_MODEL 覆盖。
长下载在服务器端 nohup 后台进行（断连不影响），轮询直到就绪，再以 sudo 跑 setup_vqa.sh 完成
unit 注入 + 重启 + 自检。可重复执行（幂等）。
"""
from __future__ import annotations

import os
import time

import _ssh

APP = "/opt/labeling-auto"
VQA_MODEL = os.environ.get("LA_VQA_MODEL", "qwen2.5vl:7b")
LOCAL_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "setup_vqa.sh")

c = _ssh.connect_retry()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}; VQA_MODEL={VQA_MODEL}")

# 0) 上传 setup_vqa.sh
_ssh.run(c, f"mkdir -p {APP}/deploy")
_ssh.put(c, LOCAL_SCRIPT, f"{APP}/deploy/setup_vqa.sh")
print("uploaded setup_vqa.sh")

# 1) 确保 Ollama 在线
rc, out, err = _ssh.run(c, "curl -fsS -m 5 http://127.0.0.1:11434/api/tags >/dev/null && echo ONLINE || echo DOWN")
if "ONLINE" not in out:
    rc, out, err = _ssh.sudo(c, "systemctl enable --now ollama; sleep 3")
    _ssh.show("start ollama", rc, out, err)

# 2) 已有则跳过；否则后台拉取并轮询（最长 ~90 分钟）
rc, out, err = _ssh.run(c, f"ollama list | awk '{{print $1}}' | grep -qx '{VQA_MODEL}' && echo HAVE || echo NEED")
if "HAVE" in out:
    print(f"model {VQA_MODEL} already present")
else:
    print(f">>> pulling {VQA_MODEL} in background (~6GB, may be slow) ...")
    _ssh.run(c, f"nohup ollama pull {VQA_MODEL} > {APP}/vqa_pull.log 2>&1 & echo started pid $!")
    ready = False
    for i in range(180):  # 180 * 30s = 90 min
        time.sleep(30)
        rc, out, err = _ssh.run(
            c, f"ollama list | awk '{{print $1}}' | grep -qx '{VQA_MODEL}' && echo READY || "
               f"tail -c 120 {APP}/vqa_pull.log | tr '\\r' '\\n' | tail -1")
        line = out.strip().splitlines()[-1] if out.strip() else ""
        if "READY" in out:
            ready = True
            print(f"  model ready after ~{(i + 1) * 30}s")
            break
        print(f"  [{(i + 1) * 30}s] {line}")
    if not ready:
        raise SystemExit("model pull did not finish in time; check $APP/vqa_pull.log on server")

# 3) sudo 跑 setup_vqa.sh：模型已就绪 -> 跳过下载，只做 unit 注入 + 重启 + 自检
rc, out, err = _ssh.sudo(c, f"VQA_MODEL={VQA_MODEL} bash {APP}/deploy/setup_vqa.sh")
_ssh.show("setup_vqa.sh (env + restart + health)", rc, out, err)

c.close()
print("\nVQA SETUP DONE")
