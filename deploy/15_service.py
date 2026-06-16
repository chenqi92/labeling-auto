"""配置 systemd 服务，开机自启，监听 0.0.0.0:8000，并验证 HTTP。"""
from __future__ import annotations

import _ssh

APP = "/opt/labeling-auto"

UNIT = f"""[Unit]
Description=labeling-auto (LocateAnything-3B auto labeling)
After=network.target

[Service]
Type=simple
User={_ssh.USER}
WorkingDirectory={APP}/backend
Environment=LA_MODEL_ID={APP}/models/LocateAnything-3B
Environment=LA_DEVICE=cuda
Environment=LA_TORCH_DTYPE=bfloat16
Environment=LA_LOAD_IN_4BIT=0
Environment=LA_LOAD_IN_8BIT=0
Environment=LA_ATTN_IMPLEMENTATION=sdpa
Environment=LA_GENERATION_MODE=slow
Environment=LA_MAX_IMAGE_SIDE=1280
Environment=LA_DATA_DIR={APP}/data
Environment=HF_ENDPOINT=https://hf-mirror.com
Environment=HF_HUB_OFFLINE=1
ExecStart={APP}/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
"""

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

# 数据目录
rc, out, err = _ssh.run(c, f"mkdir -p {APP}/data && echo ok")
_ssh.show("mkdir data", rc, out, err)

# 写 unit 文件（先写到家目录，再 sudo 移动）
rc, out, err = _ssh.run(c, f"cat > /tmp/labeling-auto.service <<'UNIT'\n{UNIT}UNIT\necho written")
_ssh.show("write unit (tmp)", rc, out, err)

rc, out, err = _ssh.sudo(
    c,
    "install -m 0644 /tmp/labeling-auto.service /etc/systemd/system/labeling-auto.service && "
    "rm -f /tmp/labeling-auto.service && "
    "systemctl daemon-reload && "
    "systemctl enable labeling-auto && "
    "systemctl restart labeling-auto && "
    "sleep 4 && systemctl is-active labeling-auto && "
    "systemctl --no-pager -l status labeling-auto | head -15",
)
_ssh.show("install + start service", rc, out, err)

# HTTP 自检（服务秒起，模型懒加载）
rc, out, err = _ssh.run(
    c,
    "sleep 2; "
    "echo health:; curl -s -m 8 http://127.0.0.1:8000/api/health; echo; "
    "echo tasks:; curl -s -m 8 http://127.0.0.1:8000/api/tasks | head -c 200; echo; "
    "echo model-status:; curl -s -m 8 http://127.0.0.1:8000/api/model/status; echo; "
    "echo frontend:; curl -s -m 8 -o /dev/null -w 'index.html http=%{http_code}\\n' http://127.0.0.1:8000/",
    timeout=40,
)
_ssh.show("http self-check", rc, out, err)

c.close()
print("\nSERVICE STEP DONE")
