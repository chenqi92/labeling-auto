"""轻量 SSH/SFTP 助手（paramiko）。主机/账号/密码从环境变量读取，不写进文件。

  LA_DEPLOY_HOST, LA_DEPLOY_USER, LA_DEPLOY_PASS, [LA_DEPLOY_PORT=22]
"""
from __future__ import annotations

import os
import shlex
import sys
import time

import paramiko

HOST = os.environ["LA_DEPLOY_HOST"]
USER = os.environ["LA_DEPLOY_USER"]
PASS = os.environ["LA_DEPLOY_PASS"]
PORT = int(os.environ.get("LA_DEPLOY_PORT", "22"))


def connect() -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        HOST,
        port=PORT,
        username=USER,
        password=PASS,
        timeout=25,
        look_for_keys=False,
        allow_agent=False,
        banner_timeout=25,
    )
    return c


def connect_retry(n: int = 6, delay: int = 5) -> paramiko.SSHClient:
    """高延迟/不稳定链路下带重试的连接。"""
    last = None
    for i in range(n):
        try:
            return connect()
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"  connect attempt {i+1}/{n} failed: {type(e).__name__}")
            time.sleep(delay)
    raise last  # type: ignore[misc]


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 900) -> tuple[int, str, str]:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def sudo(c: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str, str]:
    full = f"sudo -S -p '' bash -lc {shlex.quote(cmd)}"
    stdin, stdout, stderr = c.exec_command(full, timeout=timeout)
    stdin.write(PASS + "\n")
    stdin.flush()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def put(c: paramiko.SSHClient, local: str, remote: str) -> None:
    sftp = c.open_sftp()
    try:
        sftp.put(local, remote)
    finally:
        sftp.close()


def show(label: str, rc: int, out: str, err: str) -> None:
    print(f"\n=== {label} (rc={rc}) ===")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("[stderr]", err.rstrip(), file=sys.stderr)


if __name__ == "__main__":
    t0 = time.time()
    c = connect()
    print(f"connected to {USER}@{HOST}:{PORT} in {time.time()-t0:.1f}s")
    c.close()
