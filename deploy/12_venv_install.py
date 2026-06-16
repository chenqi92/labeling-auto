"""创建 venv，安装 torch(cu128)+依赖，放置 decord stub，做 import/CUDA 自检。"""
from __future__ import annotations

import _ssh

APP = "/opt/labeling-auto"
PY = f"{APP}/.venv/bin/python"
PIP = f"{APP}/.venv/bin/pip"

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")


def step(label, cmd, timeout):
    rc, out, err = _ssh.run(c, cmd, timeout=timeout)
    _ssh.show(label, rc, out, err)
    return rc


# 1) venv + pip 工具升级
step(
    "create venv + upgrade pip",
    f"cd {APP} && python3 -m venv .venv && "
    f"{PIP} install --no-cache-dir -q --upgrade pip setuptools wheel && "
    f"{PY} --version && {PIP} --version",
    timeout=180,
)

# 2) torch + torchvision（cu128，支持 Blackwell sm_120）
print("\n>>> installing torch+torchvision cu128 (大文件，耐心等待) ...")
step(
    "install torch cu128",
    f"cd {APP} && {PIP} install --no-cache-dir --progress-bar off "
    f"torch torchvision --index-url https://download.pytorch.org/whl/cu128 "
    f"> install_torch.log 2>&1; echo RC=$?; tail -6 install_torch.log",
    timeout=2400,
)

# 3) 其余依赖
print("\n>>> installing remaining requirements ...")
step(
    "install requirements-server",
    f"cd {APP} && {PIP} install --no-cache-dir --progress-bar off "
    f"-r backend/requirements-server.txt > install_reqs.log 2>&1; "
    f"echo RC=$?; tail -8 install_reqs.log",
    timeout=1800,
)

# 4) 放置 decord stub
step(
    "install decord stub",
    f'SP=$({PY} -c "import site;print(site.getsitepackages()[0])") && '
    f"cp -r {APP}/deploy/decord_stub/decord \"$SP\"/ && "
    f'echo "stub at $SP/decord" && ls "$SP"/decord',
    timeout=60,
)

# 5) import + CUDA 自检
step(
    "import + CUDA self-test",
    f"{PY} - <<'PY'\n"
    "import torch, cv2, lmdb, decord, numpy, PIL, transformers, peft\n"
    "print('torch', torch.__version__)\n"
    "print('cuda available:', torch.cuda.is_available())\n"
    "print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')\n"
    "print('bf16 supported:', torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False)\n"
    "print('cv2', cv2.__version__, '| transformers', transformers.__version__, '| numpy', numpy.__version__, '| PIL', PIL.__version__)\n"
    "print('decord stub:', decord.__version__)\n"
    "PY",
    timeout=120,
)

c.close()
print("\nVENV INSTALL DONE")
