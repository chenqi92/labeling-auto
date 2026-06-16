# frontend — 标注界面

React + Vite + TypeScript + Tailwind v4 + Zustand。

## 开发

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`vite.config.ts` 已把 `/api` 代理到 `http://localhost:8000`，所以先把后端跑起来即可。

## 构建（生产）

```bash
npm run build        # 产物在 frontend/dist
```

后端 `app/main.py` 检测到 `frontend/dist` 存在时会自动托管它，
即只跑 `uvicorn app.main:app` 就能在 8000 端口访问整套界面。

## 交互

- 左栏：上传 / 切换图片（点击或拖拽，支持多张）。
- 顶栏：模型状态、加载模型、导出 YOLO。
- 工具条：选任务（检测 / 短语定位 / OCR / GUI / 指向）→ 输入描述 → 「检测当前」或「检测全部」。
- 画布：滚轮缩放、空格或中键拖动、空白处拖拽画新框、点选框后用 8 个控制点改大小或拖动移动、`Del` 删除、`Esc` 取消。
- 右栏：类别管理（高亮类别 = 新框归属）、当前图标注列表（改类别 / 删除 / 清空）。
