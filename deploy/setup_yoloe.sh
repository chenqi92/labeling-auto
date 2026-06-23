#!/usr/bin/env bash
# 配置 YOLOE-26 检测引擎：确保 ultralytics 已装，预取权重与 MobileCLIP2 文本编码器到位。
# 在目标服务器上运行。内网下载走代理（默认与 ollama 同一个 127.0.0.1:1081）。
#
# 关键点：YOLOE 文字 prompt 需要 MobileCLIP2 文本编码器 mobileclip2_b.ts，ultralytics 默认
# 下到「当前工作目录」。labeling-auto 服务的 WorkingDirectory 是 backend/，所以这里 cd 到
# backend 触发下载，让编码器落在服务运行时能找到的位置（否则首次检测会卡在无代理下载）。
set -uo pipefail

APP="${APP_DIR:-/opt/labeling-auto}"
PY="$APP/.venv/bin/python"
WEIGHTS_DIR="${YOLOE_WEIGHTS_DIR:-/data/ultralytics/weights}"
CONFIG_DIR="${YOLO_CONFIG_DIR:-/data/ultralytics}"
PROXY="${YOLOE_PROXY:-http://127.0.0.1:1081}"
VARIANTS="${YOLOE_VARIANTS:-yoloe-26l-seg.pt yoloe-26s-seg.pt}"

say() { echo "[setup_yoloe] $*"; }

mkdir -p "$WEIGHTS_DIR" "$CONFIG_DIR"

say "确保 ultralytics 已安装"
"$PY" -c "import ultralytics" 2>/dev/null \
  || HTTPS_PROXY="$PROXY" HTTP_PROXY="$PROXY" "$APP/.venv/bin/pip" install -q ultralytics

say "预取权重 + 文本编码器（首次约几十~两百MB，走代理 $PROXY）"
cd "$APP/backend"  # 让 mobileclip2_b.ts 落到服务工作目录
HTTPS_PROXY="$PROXY" HTTP_PROXY="$PROXY" YOLO_CONFIG_DIR="$CONFIG_DIR" \
  "$PY" - "$WEIGHTS_DIR" $VARIANTS <<'PY'
import os, sys
from ultralytics import YOLOE
wdir = sys.argv[1]
for w in sys.argv[2:]:
    m = YOLOE(os.path.join(wdir, w))
    m.get_text_pe(["object"])  # 触发下载 mobileclip2_b.ts 到 CWD(=backend)
    print("ready:", w)
PY

say "完成。权重在 $WEIGHTS_DIR；文本编码器 mobileclip2_b.ts 在 $APP/backend/"
say "前端「引擎」下拉将出现 LocateAnything / YOLOE-26-L / YOLOE-26-S。"
