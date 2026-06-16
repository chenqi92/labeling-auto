"""上传 smoke_model.py 并在服务器用 GPU 真实跑一次推理。"""
from __future__ import annotations

import os

import _ssh

APP = "/opt/labeling-auto"
PY = f"{APP}/.venv/bin/python"
HERE = os.path.dirname(os.path.abspath(__file__))

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

_ssh.put(c, os.path.join(HERE, "smoke_model.py"), f"{APP}/backend/smoke_model.py")

env = (
    f"LA_MODEL_ID={APP}/models/LocateAnything-3B "
    "LA_LOAD_IN_4BIT=0 LA_LOAD_IN_8BIT=0 LA_DEVICE=cuda LA_TORCH_DTYPE=bfloat16 "
    "LA_ATTN_IMPLEMENTATION=sdpa LA_GENERATION_MODE=slow LA_MAX_IMAGE_SIDE=1024 "
    f"PYTHONPATH={APP}/backend HF_ENDPOINT=https://hf-mirror.com"
)
print(">>> running real GPU inference (model load + 2 detections, 首次较慢) ...")
rc, out, err = _ssh.run(
    c,
    f"cd {APP}/backend && {env} {PY} smoke_model.py 2>&1; echo RC=$?",
    timeout=900,
)
_ssh.show("model smoke", rc, out, err)

# 顺带看显存占用
rc, out, err = _ssh.run(c, "nvidia-smi --query-gpu=memory.used,memory.total --format=csv")
_ssh.show("gpu mem", rc, out, err)

c.close()
print("\nMODEL SMOKE STEP DONE")
