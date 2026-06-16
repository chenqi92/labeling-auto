"""连上服务器，清点环境：OS / Python / Node / GPU / 磁盘 / 网络 / sudo。"""
from __future__ import annotations

import _ssh

c = _ssh.connect()
print(f"CONNECTED to {_ssh.USER}@{_ssh.HOST}")

checks = [
    ("whoami / host", "whoami; hostname; uname -a"),
    ("os-release", "cat /etc/os-release 2>/dev/null | head -8"),
    ("cpu / mem", "nproc; free -h | head -2"),
    ("disk /", "df -h / /home 2>/dev/null"),
    ("python3", "python3 --version 2>&1; which python3; python3 -m venv --help >/dev/null 2>&1 && echo 'venv: ok' || echo 'venv: MISSING'"),
    ("pip", "python3 -m pip --version 2>&1 || echo 'pip MISSING'"),
    ("node/npm", "node --version 2>&1; npm --version 2>&1"),
    ("nvidia-smi", "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv 2>&1 || echo 'NO GPU / no nvidia-smi'"),
    ("cuda", "nvcc --version 2>&1 | tail -2 || echo 'no nvcc'; ls -d /usr/local/cuda* 2>/dev/null"),
    ("internet (huggingface)", "curl -s -m 12 -o /dev/null -w 'hf.co http=%{http_code} time=%{time_total}s\\n' https://huggingface.co 2>&1 || echo 'curl failed'"),
    ("internet (pypi)", "curl -s -m 12 -o /dev/null -w 'pypi http=%{http_code}\\n' https://pypi.org/simple/ 2>&1 || echo 'curl failed'"),
    ("ports in use", "ss -ltn 2>/dev/null | grep -E ':(80|8000|8080|443) ' || echo 'none of 80/8000/8080/443 listening'"),
    ("existing app dir", "ls -la /opt/labeling-auto 2>/dev/null; ls -la ~/labeling-auto 2>/dev/null; echo '---'"),
]

for label, cmd in checks:
    rc, out, err = _ssh.run(c, cmd, timeout=40)
    _ssh.show(label, rc, out, err)

# sudo 能力
rc, out, err = _ssh.sudo(c, "echo sudo-ok && id -un", timeout=30)
_ssh.show("sudo test", rc, out, err)

c.close()
print("\nINVENTORY DONE")
