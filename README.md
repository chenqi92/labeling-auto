# labeling-auto

基于 **NVIDIA LocateAnything-3B** 的图片自动标注 Web 工具。

上传一张或多张图片 → 用自然语言描述要检测的目标（开放词汇检测 / OCR / 短语定位 / GUI 元素）→
模型自动画框 → 在画布上手动增删改框、调整类别 → 一键导出为 **YOLO** 数据集（`images/`、`labels/`、`data.yaml`）。

```
labeling-auto/
├── backend/        FastAPI + LocateAnything-3B 推理 + YOLO 导出
│   └── app/
│       ├── main.py            FastAPI 入口 / 路由
│       ├── config.py          配置（环境变量 LA_*）
│       ├── schemas.py         请求/响应模型
│       ├── engine/            模型引擎（真实 + mock + 解析 + prompt）
│       └── services/          图片存储 + YOLO 导出
├── frontend/       React + Vite + TypeScript + Tailwind 标注界面
└── README.md
```

## 后端

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
# 单独安装匹配 CUDA 的 torch，例如 cu124：
#   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
uvicorn app.main:app --reload --port 8000
```

模型 **懒加载**：服务秒启动，首次检测（或调用 `/api/model/load`）时才加载 ~6GB 权重。
6GB 显存的 RTX 3060 默认以 4-bit 加载（`LA_LOAD_IN_4BIT=1`）。
无 GPU 时可设 `LA_MOCK=1` 用假框跑通整套 UI。

## 前端

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 ，已代理 /api 到 8000
```

详见 `backend/README.md`、`frontend/README.md`。许可证：模型遵循 NVIDIA 非商业许可，仅限研究/学习用途。
