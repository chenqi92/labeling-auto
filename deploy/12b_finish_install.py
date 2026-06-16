"""用 aliyun 镜像补完安装：确保 torch(cu128) + 依赖 + decord stub，并做 import/CUDA 自检。"""
from __future__ import annotations

import _ssh

APP = "/opt/labeling-auto"
PY = f"{APP}/.venv/bin/python"
PIP = f"{APP}/.venv/bin/pip"
ALI = "https://mirrors.aliyun.com/pypi/simple/"
TORCH_IDX = "https://download.pytorch.org/whl/cu128"

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")


def step(label, cmd, timeout):
    rc, out, err = _ssh.run(c, cmd, timeout=timeout)
    _ssh.show(label, rc, out, err)
    return rc


# pip 默认走 aliyun（后续 huggingface_hub 等子依赖也用得上）
step("set pip mirror=aliyun",
     f"{PIP} config set global.index-url {ALI} && {PIP} config set global.trusted-host mirrors.aliyun.com",
     timeout=30)

# torch + torchvision：主源用 pytorch cu128，缺的纯依赖回落 aliyun
print("\n>>> ensure torch+torchvision cu128 (若已装则秒过) ...")
step("install torch cu128",
     f"cd {APP} && {PIP} install --no-cache-dir --progress-bar off "
     f"--index-url {TORCH_IDX} --extra-index-url {ALI} "
     f"torch torchvision > install_torch.log 2>&1; echo RC=$?; tail -5 install_torch.log",
     timeout=3000)

# 其余依赖（aliyun）
print("\n>>> install requirements (aliyun) ...")
step("install requirements-server",
     f"cd {APP} && {PIP} install --no-cache-dir --progress-bar off -i {ALI} "
     f"-r backend/requirements-server.txt > install_reqs.log 2>&1; echo RC=$?; tail -10 install_reqs.log",
     timeout=1800)

# decord stub
step("install decord stub",
     f'SP=$({PY} -c "import site;print(site.getsitepackages()[0])") && '
     f"cp -r {APP}/deploy/decord_stub/decord \"$SP\"/ && ls \"$SP\"/decord",
     timeout=60)

# import + CUDA 自检
step("import + CUDA self-test",
     f"{PY} - <<'PY'\n"
     "import torch, cv2, lmdb, decord, numpy, PIL, transformers, peft, huggingface_hub, fastapi\n"
     "print('torch', torch.__version__, '| cuda', torch.cuda.is_available())\n"
     "print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')\n"
     "print('bf16:', torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False)\n"
     "print('cv2', cv2.__version__, '| transformers', transformers.__version__, '| numpy', numpy.__version__)\n"
     "print('hub', huggingface_hub.__version__, '| decord(stub)', decord.__version__)\n"
     "PY",
     timeout=120)

c.close()
print("\nFINISH INSTALL DONE")
