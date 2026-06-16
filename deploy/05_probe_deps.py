"""判定 Python 版本路线：检查 opencv/lmdb/decord/eva-decord 在 PyPI 的 wheel 适配的 CPython 版本，
以及 apt 是否可装 python3.12。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()

# apt 是否有 3.12
rc, out, err = _ssh.run(
    c,
    "apt-cache policy python3.12 python3.12-venv python3.12-dev 2>&1 | "
    "grep -E 'python3.12|Candidate|Installed' | head -20; echo '---'; "
    "apt-cache policy python3-pip python3-venv build-essential 2>&1 | grep -E 'Candidate' ",
    timeout=40,
)
_ssh.show("apt python3.12 / pip / venv", rc, out, err)

# pypi 上各包最新版的 wheel python 标签
pkgs = ["opencv-python-headless", "lmdb", "decord", "eva-decord", "numpy", "pillow"]
prog = (
    "import json,sys,urllib.request\n"
    "p=sys.argv[1]\n"
    "try:\n"
    "  d=json.load(urllib.request.urlopen('https://pypi.org/pypi/%s/json'%p,timeout=20))\n"
    "  v=d['info']['version']\n"
    "  tags=sorted({f['filename'].split('-')[2] if f['packagetype']=='bdist_wheel' and len(f['filename'].split('-'))>2 else 'sdist' for f in d['urls']})\n"
    "  print('%s latest=%s  wheel_pytags=%s'%(p,v,tags))\n"
    "except Exception as e:\n"
    "  print('%s ERROR %s'%(p,e))\n"
)
# 用 system python3 (3.14) 跑（只用 stdlib）
script = prog
import base64

b64 = base64.b64encode(script.encode()).decode()
for p in pkgs:
    rc, out, err = _ssh.run(
        c, f"echo {b64} | base64 -d | python3 - {p} 2>&1", timeout=40
    )
    _ssh.show(f"pypi {p}", rc, out, err)

c.close()
print("\nDEPS PROBE DONE")
