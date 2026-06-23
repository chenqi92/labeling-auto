#!/usr/bin/env bash
# 在目标服务器上一键配置「状态检测/巡检(VQA)」与「文字识别(OCR)」所需的运行环境。
# 做四件事：确保 Ollama 在线 -> 拉取视觉模型 -> 给 labeling-auto 注入显存/模型环境变量 -> 自检。
# 幂等：可重复执行，不会重复注入。
#
# 用法（直接在服务器上跑；需要 sudo 用于改 systemd unit）：
#   bash deploy/setup_vqa.sh
#   VQA_MODEL=qwen2.5vl:7b bash deploy/setup_vqa.sh      # 指定模型
#
# 可调环境变量：
#   VQA_MODEL    要拉取并使用的 Ollama 视觉模型（默认 qwen2.5vl:7b）
#   OLLAMA_HOST  Ollama 地址（默认 http://127.0.0.1:11434）
#   APP_DIR      labeling-auto 部署目录（默认 /opt/labeling-auto）
#   SERVICE      labeling-auto 的 systemd 服务名（默认 labeling-auto）
set -uo pipefail

VQA_MODEL="${VQA_MODEL:-qwen3.5:9b-q8_0}"   # 任意带 vision 能力的 Ollama 模型，可用环境变量覆盖
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
APP_DIR="${APP_DIR:-/opt/labeling-auto}"
SERVICE="${SERVICE:-labeling-auto}"
UNIT="/etc/systemd/system/${SERVICE}.service"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

say() { echo "[setup_vqa] $*"; }
fail() { echo "[setup_vqa][ERROR] $*" >&2; exit 1; }

# 1) 确保 Ollama 已安装并在线
say "1/4 检查 Ollama ($OLLAMA_HOST)"
if ! command -v ollama >/dev/null 2>&1; then
  say "未检测到 ollama，尝试安装官方版本（如在内网，请先设置 https_proxy）"
  curl -fsSL https://ollama.com/install.sh | sh || fail "ollama 安装失败，请手动安装后重试"
fi
if ! curl -fsS -m 5 "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
  say "Ollama 未响应，尝试启动服务"
  $SUDO systemctl enable --now ollama 2>/dev/null || nohup ollama serve >/tmp/ollama_serve.log 2>&1 &
  for i in $(seq 1 10); do
    curl -fsS -m 5 "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1 && break
    sleep 2
  done
fi
curl -fsS -m 5 "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1 || fail "Ollama 仍不可达，检查：systemctl status ollama"
say "Ollama 在线"

# 2) 拉取视觉模型（首次约 6GB，内网经代理可能较慢；ollama 自带断点续传）
say "2/4 拉取视觉模型 ${VQA_MODEL}（首次较慢，请耐心等待）"
if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "${VQA_MODEL}"; then
  say "模型 ${VQA_MODEL} 已存在，跳过下载"
else
  ollama pull "${VQA_MODEL}" || fail "模型拉取失败：ollama pull ${VQA_MODEL}"
fi
ollama list | awk '{print $1}' | grep -qx "${VQA_MODEL}" || fail "拉取后仍未在 ollama list 中看到 ${VQA_MODEL}"
say "模型就绪：${VQA_MODEL}"

# 3) 给 labeling-auto 注入环境变量（显存回收 + VQA 模型名），幂等
say "3/4 配置 ${SERVICE} 环境变量"
if [ -f "$UNIT" ]; then
  add_env() {  # add_env KEY=VALUE —— 不存在该 KEY 时插到 ExecStart 之前
    local kv="$1" key="${1%%=*}"
    if grep -q "Environment=${key}=" "$UNIT"; then
      say "  已存在 ${key}，跳过"
    else
      $SUDO sed -i "\|^ExecStart=|i Environment=${kv}" "$UNIT" && say "  注入 ${kv}"
    fi
  }
  add_env "PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True"
  add_env "LA_VQA_MODEL=${VQA_MODEL}"
  add_env "LA_OLLAMA_URL=${OLLAMA_HOST}"
  $SUDO systemctl daemon-reload
  $SUDO systemctl restart "$SERVICE"
else
  say "  未找到 $UNIT（labeling-auto 主服务可能尚未部署），跳过 unit 配置"
  say "  注意：VQA 模型名走默认 ${VQA_MODEL}；如主服务用别的方式启动，请自行设 LA_VQA_MODEL"
fi

# 4) 自检
say "4/4 自检"
sleep 5
if [ -f "$UNIT" ]; then
  systemctl is-active "$SERVICE" >/dev/null 2>&1 && say "  $SERVICE: active" || say "  $SERVICE: NOT active（看 journalctl -u $SERVICE）"
  echo -n "  /api/inspect/health -> "; curl -fsS -m 8 http://127.0.0.1:8000/api/inspect/health || echo "(接口无响应)"
  echo
fi
say "完成。任务下拉应包含「状态检测 / 巡检（VQA）」与「文字识别（OCR）」。"
