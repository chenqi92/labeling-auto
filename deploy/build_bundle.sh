#!/usr/bin/env bash
# 从当前源码树重建 deploy/_bundle.tgz：构建 frontend，再打包 backend 代码 + frontend/dist + deploy 脚本。
# 产物用 deploy/11_upload.py 上传并解压到 /opt/labeling-auto。
# 在开发机（本仓库根的上层任意处）运行：bash deploy/build_bundle.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

echo "==> building frontend (npm run build)"
( cd frontend && npm run build )
[ -f frontend/dist/index.html ] || { echo "frontend/dist 未生成，构建失败" >&2; exit 1; }

echo "==> packing deploy/_bundle.tgz"
OUT="$HERE/_bundle.tgz"
tar czf "$OUT" \
  --exclude='backend/.venv' \
  --exclude='backend/.data' \
  --exclude='backend/data' \
  --exclude='backend/uploads' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='*.bak-pre-inspect' \
  backend \
  frontend/dist \
  deploy/setup_vqa.sh \
  deploy/30_vqa_setup.py \
  deploy/decord_stub

echo "==> wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo "--- 包内顶层 ---"
tar tzf "$OUT" | awk -F/ '{print $1"/"$2}' | sort -u | head -30
