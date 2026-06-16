"""确认 cu128 上 torch/torchvision 的 cp314 版本，以及 aliyun 是否稳定供应 nvidia-cudnn-cu12（带测速）。"""
from __future__ import annotations

import _ssh

c = _ssh.connect_retry()

rc, out, err = _ssh.run(
    c,
    "echo '== torch cp314 cu128 ==' ; "
    "curl -s -m 30 https://download.pytorch.org/whl/cu128/torch/ | grep -oE 'torch-[0-9][^\"]*cp314-cp314-manylinux[^\"]*\\.whl' | tail -2; "
    "echo '== torchvision cp314 cu128 ==' ; "
    "curl -s -m 30 https://download.pytorch.org/whl/cu128/torchvision/ | grep -oE 'torchvision-[0-9][^\"]*cp314-cp314-manylinux[^\"]*\\.whl' | tail -2",
    timeout=60,
)
_ssh.show("cu128 versions", rc, out, err)

# aliyun 是否有 cudnn 9.19.0.56，并测下载速度（下 30MB 即停）
rc, out, err = _ssh.run(
    c,
    "URL=$(curl -s -m 30 https://mirrors.aliyun.com/pypi/simple/nvidia-cudnn-cu12/ "
    "| grep -oE 'https://[^\"]*nvidia_cudnn_cu12-9.19.0.56-py3-none-manylinux_2_27_x86_64.whl[^\"]*' | head -1 | sed 's/#.*//'); "
    "echo \"aliyun cudnn url: $URL\"; "
    "if [ -n \"$URL\" ]; then "
    "  echo '== speed test (30MB) =='; "
    "  curl -s -m 25 -r 0-31457280 -o /tmp/cudnn_part \"$URL\" -w 'got %{size_download} bytes @ %{speed_download} B/s, http=%{http_code}\\n'; "
    "  echo '== range/resume supported? (expect 206) =='; "
    "  curl -s -m 15 -I -r 0-1023 \"$URL\" | grep -iE 'HTTP/|content-range|accept-ranges'; "
    "fi",
    timeout=60,
)
_ssh.show("aliyun cudnn availability+speed", rc, out, err)

c.close()
print("\nPROBE DONE")
