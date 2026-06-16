"""经 hf-mirror 下载 nvidia/LocateAnything-3B 到本地目录（含 trust_remote_code 的 .py）。"""
from __future__ import annotations

import _ssh

APP = "/opt/labeling-auto"
PY = f"{APP}/.venv/bin/python"
MODEL_DIR = f"{APP}/models/LocateAnything-3B"

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

rc, out, err = _ssh.run(c, "df -h / | tail -1")
_ssh.show("disk before", rc, out, err)

# 下载脚本写到服务器
dl = (
    "import os\n"
    "os.environ.setdefault('HF_ENDPOINT','https://hf-mirror.com')\n"
    "from huggingface_hub import snapshot_download\n"
    f"p=snapshot_download('nvidia/LocateAnything-3B', local_dir=r'{MODEL_DIR}')\n"
    "print('downloaded to', p)\n"
)
rc, out, err = _ssh.run(c, f"cat > {APP}/dl_model.py <<'PY'\n{dl}PY\necho written", timeout=30)
_ssh.show("write dl script", rc, out, err)

print("\n>>> downloading model (~6GB via mirror) ...")
rc, out, err = _ssh.run(
    c,
    f"cd {APP} && HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_PROGRESS_BARS=1 "
    f"{PY} dl_model.py > model_dl.log 2>&1; echo RC=$?; tail -4 model_dl.log",
    timeout=2400,
)
_ssh.show("download", rc, out, err)

rc, out, err = _ssh.run(
    c,
    f"echo '--- files ---'; ls -la {MODEL_DIR} | head -40; "
    f"echo '--- size ---'; du -sh {MODEL_DIR}; "
    f"echo '--- safetensors present? ---'; ls {MODEL_DIR}/*.safetensors; "
    f"echo '--- custom code present? ---'; ls {MODEL_DIR}/*.py",
    timeout=60,
)
_ssh.show("verify model files", rc, out, err)

rc, out, err = _ssh.run(c, "df -h / | tail -1")
_ssh.show("disk after", rc, out, err)

c.close()
print("\nMODEL DOWNLOAD DONE")
