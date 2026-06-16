"""上传部署包并解压到 /opt/labeling-auto，再放置 decord stub 占位目录。"""
from __future__ import annotations

import os

import _ssh

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, "_bundle.tgz")

c = _ssh.connect()
print(f"CONNECTED; uploading {os.path.getsize(BUNDLE)} bytes ...")
_ssh.put(c, BUNDLE, "/tmp/labeling-bundle.tgz")

rc, out, err = _ssh.run(
    c,
    "set -e; cd /opt/labeling-auto && tar xzf /tmp/labeling-bundle.tgz && "
    "rm -f /tmp/labeling-bundle.tgz && "
    "echo '--- layout ---' && find . -maxdepth 3 -type d | sort && "
    "echo '--- dist ---' && ls frontend/dist && "
    "echo '--- app ---' && ls backend/app",
    timeout=60,
)
_ssh.show("extract + layout", rc, out, err)

c.close()
print("\nUPLOAD DONE")
