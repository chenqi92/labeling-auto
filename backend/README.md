# backend — LocateAnything-3B 推理服务

FastAPI 服务：图片上传 / 自动检测 / YOLO 导出。模型懒加载。

## 安装

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows（Linux/WSL: source .venv/bin/activate）

# 1) 先装匹配 CUDA 的 torch（示例 cu124）
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
# 2) 其余依赖
pip install -r requirements.txt
```

## 运行

```bash
uvicorn app.main:app --reload --port 8000
```

- 服务**秒启动**；首次 `/api/detect`（或前端「加载模型」）时才加载 ~6GB 权重。
- 无 GPU 联调 UI：`LA_MOCK=1 uvicorn app.main:app --port 8000`（Windows: `set LA_MOCK=1 && ...`）。

## 配置（环境变量，前缀 `LA_`）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LA_MODEL_ID` | `nvidia/LocateAnything-3B` | HuggingFace 模型 id 或本地路径 |
| `LA_LOAD_IN_4BIT` | `1` | 4-bit nf4 量化（6GB 显存必需） |
| `LA_LOAD_IN_8BIT` | `0` | 8-bit（比 4-bit 占用更大，仅在 4-bit 精度不佳时用） |
| `LA_ATTN_IMPLEMENTATION` | `sdpa` | `sdpa`/`eager`/`flash_attention_2`；加载失败自动降级 |
| `LA_GENERATION_MODE` | `slow` | `slow`/`hybrid`/`fast`；slow 最稳 |
| `LA_MAX_IMAGE_SIDE` | `1280` | 推理前长边缩放上限（省显存，不损标注精度；0=不缩放） |
| `LA_MAX_NEW_TOKENS` | `1024` | 单次生成上限 |
| `LA_DEVICE` | `cuda` | `cuda`/`cpu` |
| `LA_MOCK` | `0` | 假引擎，免 GPU 跑通流程 |

## 关于硬件 / 系统

- 模型官方仅声明支持 **Linux + CUDA + BF16**，权重 bf16 约 6GB。
- 你的 RTX 3060 Laptop（6GB）即使 4-bit，1024px 推理显存也偏紧 →
  默认 `LA_MAX_IMAGE_SIDE=1280` 缩图、`generation_mode=slow`；如仍 OOM，调小到 768/640。
- bitsandbytes 现有 Windows sm_86 轮子，原生 Windows 可加载 4-bit；
  但 fast/hybrid 的 Parallel Box Decoding 在原生 Windows 未经官方测试，
  **推荐在 WSL2（Ubuntu）里跑**最稳妥。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/images` | multipart 上传多图，返回 `ImageMeta[]` |
| GET | `/api/images/{id}/file` | 取原图 |
| GET | `/api/tasks` | 支持的任务列表 |
| GET | `/api/model/status` | 模型状态 |
| POST | `/api/model/load` | 异步触发加载 |
| POST | `/api/detect` | 单图检测，返回原图像素坐标框 |
| POST | `/api/export/yolo` | 导出 YOLO 数据集 zip |
