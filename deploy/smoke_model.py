"""在服务器上真实加载模型并跑一次推理，验证 GPU 推理全链路。"""
from __future__ import annotations

import time

from PIL import Image, ImageDraw

from app.engine.base import DetectParams
from app.engine.locate_anything import LocateAnythingEngine
from app.engine import prompts

# 造一张带红色方块的图
img = Image.new("RGB", (640, 480), "white")
d = ImageDraw.Draw(img)
d.rectangle([120, 120, 320, 300], fill="red")
d.ellipse([400, 250, 520, 370], fill="blue")

print(">>> loading model (bf16, cuda) ...")
t0 = time.time()
eng = LocateAnythingEngine()
print("loaded in", round(time.time() - t0, 1), "s; info:", eng.info())

for desc in ["red square", "blue circle"]:
    t = time.time()
    norm, raw = eng.run(img, prompts.detection_prompt([desc]), DetectParams(mode="slow", max_new_tokens=512))
    print(f"\n[{desc}] {round(time.time()-t,1)}s  boxes(norm[0,1000])={norm}")
    print("  raw:", raw[:200].replace("\n", " "))

print("\nMODEL SMOKE OK")
