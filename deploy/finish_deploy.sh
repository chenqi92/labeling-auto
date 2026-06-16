#!/usr/bin/env bash
# 服务器端自驱部署（脱离 SSH，断连不影响）。
# 链路不稳，故：开启 pip 缓存以便断点续传 + 高重试 + 外层重试循环；
# 大的 nvidia CUDA 轮子优先走 aliyun 镜像（稳定），torch/torchvision 本体走 cu128 源。
# 进度写入 deploy_status.log（标记 DEPS_OK / ALL_DONE / FAILED:<step>）。
set +e
APP=/opt/labeling-auto
PY=$APP/.venv/bin/python
PIP=$APP/.venv/bin/pip
ALI=https://mirrors.aliyun.com/pypi/simple/
CU=https://download.pytorch.org/whl/cu128
S=$APP/deploy_status.log
I=$APP/deploy_install.log

log() { echo "[$(date +%H:%M:%S)] $*" >> "$S"; }
echo "=== orchestrator start $(date) ===" >> "$S"

# 0) 确保 venv 存在
[ -x "$PY" ] || python3 -m venv "$APP/.venv"

# 1) torch + torchvision：只用 cu128 源（避免被 aliyun 的 CPU 版 torch 顶掉）
#    缓存开启 + 重试循环，断点续传；并校验确为 CUDA 构建（torch.version.cuda 非空）
log "STEP torch (cu128 ONLY, cached, retry loop)"
ok=0
for attempt in $(seq 1 15); do
  log "  torch attempt $attempt"
  $PIP install --progress-bar off --retries 8 --timeout 60 \
    --index-url "$CU" torch torchvision >> "$I" 2>&1
  if $PY -c "import torch,torchvision; assert torch.version.cuda" 2>/dev/null; then ok=1; break; fi
  sleep 8
done
[ $ok -eq 1 ] || { log "FAILED: torch"; exit 1; }
log "torch ok: $($PY -c 'import torch;print(torch.__version__, \"cuda=\"+str(torch.version.cuda), torch.cuda.is_available())')"

# 2) 其余依赖（aliyun），同样重试
log "STEP reqs"
$PIP config set global.index-url "$ALI" >/dev/null 2>&1
$PIP config set global.trusted-host mirrors.aliyun.com >/dev/null 2>&1
ok=0
for attempt in $(seq 1 6); do
  log "  reqs attempt $attempt"
  $PIP install --progress-bar off --retries 8 --timeout 60 -i "$ALI" \
    -r "$APP/backend/requirements-server.txt" >> "$I" 2>&1
  if $PY -c "import fastapi,uvicorn,transformers,cv2,lmdb,huggingface_hub,peft,numpy,PIL" 2>/dev/null; then ok=1; break; fi
  sleep 6
done
[ $ok -eq 1 ] || { log "FAILED: reqs"; exit 1; }

# 3) decord stub
SP=$($PY -c "import site;print(site.getsitepackages()[0])")
cp -r "$APP/deploy/decord_stub/decord" "$SP"/ 2>/dev/null
$PY -c "import decord" 2>/dev/null || { log "FAILED: decord_stub"; exit 1; }
log "deps ok"
echo "DEPS_OK" >> "$S"

# 4) 清 pip 缓存腾空间
$PIP cache purge >/dev/null 2>&1

# 5) 下载模型（hf-mirror），重试
log "STEP model_download"
cat > "$APP/dl_model.py" <<'PYEOF'
import os
os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')
from huggingface_hub import snapshot_download
p = snapshot_download('nvidia/LocateAnything-3B',
                      local_dir='/opt/labeling-auto/models/LocateAnything-3B',
                      max_workers=4)
print('downloaded to', p)
PYEOF
ok=0
for attempt in $(seq 1 8); do
  log "  model attempt $attempt"
  HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_PROGRESS_BARS=1 HF_HUB_ENABLE_HF_TRANSFER=0 \
    $PY "$APP/dl_model.py" >> "$I" 2>&1
  if ls "$APP"/models/LocateAnything-3B/*.safetensors >/dev/null 2>&1 \
     && [ -f "$APP/models/LocateAnything-3B/config.json" ]; then ok=1; break; fi
  sleep 8
done
[ $ok -eq 1 ] || { log "FAILED: model_download"; exit 1; }
log "model ok ($(du -sh "$APP/models/LocateAnything-3B" | cut -f1))"
echo "ALL_DONE" >> "$S"
log "ALL_DONE"
