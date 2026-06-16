"""测各国内 pip 镜像可达性 + 真实下载（pip download 一个小包）以选定 index。"""
from __future__ import annotations

import _ssh

APP = "/opt/labeling-auto"
PIP = f"{APP}/.venv/bin/pip"

MIRRORS = {
    "aliyun": "https://mirrors.aliyun.com/pypi/simple/",
    "ustc": "https://pypi.mirrors.ustc.edu.cn/simple/",
    "tencent": "https://mirrors.cloud.tencent.com/pypi/simple/",
    "huawei": "https://repo.huaweicloud.com/repository/pypi/simple/",
    "tsinghua": "https://pypi.tuna.tsinghua.edu.cn/simple/",
    "pypi.org": "https://pypi.org/simple/",
}

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

for name, url in MIRRORS.items():
    rc, out, err = _ssh.run(
        c, f"curl -s -m 10 -o /dev/null -w '%{{http_code}} t=%{{time_total}}s' {url} 2>&1 || echo FAILED",
        timeout=20,
    )
    _ssh.show(f"reach {name}", rc, out, err)

# 对最可能的两个做真实 pip download 测试
for name, url in [("aliyun", MIRRORS["aliyun"]), ("tsinghua", MIRRORS["tsinghua"])]:
    rc, out, err = _ssh.run(
        c,
        f"rm -rf /tmp/dlt; {PIP} download --no-deps --no-cache-dir -d /tmp/dlt "
        f"-i {url} certifi 2>&1 | tail -4; echo RC=${{PIPESTATUS[0]}}",
        timeout=60,
    )
    _ssh.show(f"pip download via {name}", rc, out, err)

c.close()
print("\nMIRROR PROBE DONE")
