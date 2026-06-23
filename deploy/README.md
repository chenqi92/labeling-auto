# 部署脚本

凭据不入库：所有远程脚本从环境变量读取连接信息（见 `_ssh.py`）。

```bash
export LA_DEPLOY_HOST=<服务器IP>
export LA_DEPLOY_USER=<用户名>
export LA_DEPLOY_PASS=<密码>
# export LA_DEPLOY_PORT=22
```

## 全流程（首次部署）

在开发机仓库根目录依次执行：

```bash
bash deploy/build_bundle.sh        # 1. 构建前端 + 打包 _bundle.tgz（含最新代码）
python deploy/11_upload.py         # 2. 上传解压到 /opt/labeling-auto
python deploy/10_system_prep.py    # 3. 系统准备（首次）
python deploy/12_venv_install.py   # 4. 建 venv（首次）
# 5. 服务器端自驱装依赖 + 下载 LocateAnything 模型（断连不影响）：
#    见 finish_deploy.sh / 20_launch.py / 21_wait.py
python deploy/15_service.py        # 6. 写 systemd unit 并启动 :8000（含 VQA 环境变量）
python deploy/30_vqa_setup.py      # 7. 拉取 Ollama 视觉模型 + 注入 VQA 环境 + 自检
```

## 仅更新代码

```bash
bash deploy/build_bundle.sh && python deploy/11_upload.py
python deploy/15_service.py        # 重启服务（如改了 unit/环境变量）
```

## 仅配置 VQA（状态检测/巡检 + 文字识别）

- 远程一键：`python deploy/30_vqa_setup.py`（用 `LA_VQA_MODEL` 覆盖模型，默认 `qwen2.5vl:7b`）
- 或直接登录服务器跑：`bash /opt/labeling-auto/deploy/setup_vqa.sh`

`30_vqa_setup.py` / `setup_vqa.sh` 做的事：确保 Ollama 在线 → 拉取视觉模型（首次约 6GB）→ 给
`labeling-auto` 注入 `PYTORCH_CUDA_ALLOC_CONF` / `LA_VQA_MODEL` / `LA_OLLAMA_URL` → 重启并自检
`/api/inspect/health`。幂等，可重复执行。

> VQA 走本机 Ollama（Qwen2.5-VL），空闲自动卸载显存，与常驻的 LocateAnything 检测模型分离。
> 内网拉取模型需 Ollama 服务能联网（如经代理，配在 `ollama.service` 的 `HTTP(S)_PROXY`）。
