#!/usr/bin/env bash
# 杀掉所有 orchestrator + pip。逻辑放在脚本文件里，故本进程 cmdline 不含这些 pattern，
# pkill/pgrep 不会误伤自己（pgrep 也不报告自身 PID）。
for round in $(seq 1 15); do
  for p in $(pgrep -f finish_deploy.sh); do kill -9 "$p" 2>/dev/null; done
  for p in $(pgrep -f "pip install"); do kill -9 "$p" 2>/dev/null; done
  sleep 1
done
/opt/labeling-auto/.venv/bin/pip uninstall -y torch torchvision >/dev/null 2>&1
echo done > /tmp/kill_done
